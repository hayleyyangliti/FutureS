"""Persistent OmniData news cache for the verified sources on the ECS host.

Run once from a systemd timer, or import read_feed/refresh_due from the gateway.
No crawler runs inside a reader request. A stale reader may start this worker in
the background and immediately receive the last successful snapshot.
"""

import fcntl
import hashlib
import json
import os
from contextlib import contextmanager
from pathlib import Path
import sqlite3
import sys
import time
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import httpx

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / 'data' / 'news_cache.sqlite3'
LOCK_PATH = HERE / 'data' / 'news_cache.lock'
KEY_PATH = HERE / '.omnidata-api-key'
BASE_URL = 'http://127.0.0.1:8080'
SHANGHAI = ZoneInfo('Asia/Shanghai')
CACHE_POLICY_VERSION = '2026-10-20-domestic-supply-chain-v1'

# Retain the 11 previously productive sources and add domestic market-news
# publishers that were enabled in OmniData but missing from the cached feed.
# Sources that are temporarily unavailable keep their last successful articles.
SOURCES = (
    'yicai_quick_news', 'sina_finance_news', 'hexun_global_news',
    'futunn_flash_news', 'wallstreetcn_global_news', 'jin10_flash_news',
    'fortune_flash_news', 'marketwatch_flash_news', '21jingji_quick_news',
    'ths_10jqka_global_news', 'jrj_news_flash', 'eastmoney_fast_news',
    'cls_global_news', 'xueqiu_flash_news', 'xuangubao_flash_news',
    'jiemian_flash_news', 'gelonghui_flash_news', 'investing_news',
    'forbes_flash_news',
)
SOURCE_PARAMS = {
    'eastmoney_fast_news': {'page_size': 100, 'fast_column': '113,117'},
    'wallstreetcn_global_news': {'channel': 'commodity', 'limit': 100},
    'yicai_quick_news': {'page_size': 50},
    'sina_finance_news': {'page_size': 100, 'tag_id': 0},
    'hexun_global_news': {'page_size': 100},
    'xueqiu_flash_news': {'limit': 50},
    'xuangubao_flash_news': {'limit': 50},
    'jiemian_flash_news': {'limit': 50},
    'gelonghui_flash_news': {'limit': 50, 'channel': 'exchangeCommodity'},
}

# 2026 mainland exchange closures, from the official SSE/SHFE annual calendars.
# The server expires in November 2026. Unknown future years fail closed until
# the calendar is updated, rather than silently treating holidays as sessions.
HOLIDAYS_2026 = (
    ('2026-01-01', '2026-01-03'), ('2026-02-15', '2026-02-23'),
    ('2026-04-04', '2026-04-06'), ('2026-05-01', '2026-05-05'),
    ('2026-06-19', '2026-06-21'), ('2026-09-25', '2026-09-27'),
    ('2026-10-01', '2026-10-07'),
)


def is_trading_date(day: date) -> bool:
    if day.year != 2026 or day.weekday() >= 5:
        return False
    return not any(date.fromisoformat(start) <= day <= date.fromisoformat(end)
                   for start, end in HOLIDAYS_2026)


def current_slot(now: datetime | None = None) -> str | None:
    local = (now or datetime.now(SHANGHAI)).astimezone(SHANGHAI)
    if not is_trading_date(local.date()):
        return None
    return local.replace(minute=30 if local.minute >= 30 else 0,
                         second=0, microsecond=0).isoformat()


@contextmanager
def connect():
    DB_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA busy_timeout=10000')
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS articles (
          article_id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          payload TEXT NOT NULL,
          collected_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS articles_collected_at
          ON articles(collected_at DESC);
        CREATE TABLE IF NOT EXISTS source_status (
          source TEXT PRIMARY KEY,
          last_attempt_at TEXT,
          last_success_at TEXT,
          last_count INTEGER,
          last_error TEXT
        );
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
    ''')
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def get_metadata(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute('SELECT value FROM metadata WHERE key=?', (key,)).fetchone()
    return row[0] if row else None


def set_metadata(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute('INSERT INTO metadata(key,value) VALUES(?,?) '
                 'ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                 (key, value))


def refresh_due() -> bool:
    slot = current_slot()
    if not slot:
        return False
    with connect() as conn:
        return (get_metadata(conn, 'completed_slot') != slot or
                get_metadata(conn, 'completed_policy') != CACHE_POLICY_VERSION)


def read_feed(limit: int = 200) -> dict:
    limit = min(max(limit, 1), 500)
    slot = current_slot()
    with connect() as conn:
        rows = conn.execute(
            'SELECT source,payload,collected_at FROM ('
            'SELECT source,payload,collected_at, '
            'ROW_NUMBER() OVER (PARTITION BY source ORDER BY '
            "COALESCE(json_extract(payload,'$.pub_time'),json_extract(payload,'$.publish_time'),"
            "json_extract(payload,'$.publishTime'),json_extract(payload,'$.published_at'),"
            "json_extract(payload,'$.time'),json_extract(payload,'$.datetime'),collected_at) DESC,"
            'collected_at DESC,article_id) AS source_rank '
            'FROM articles) ORDER BY source_rank,collected_at DESC,source LIMIT ?',
            (limit,)).fetchall()
        source_rows = conn.execute(
            'SELECT source,last_attempt_at,last_success_at,last_count,last_error '
            'FROM source_status ORDER BY source').fetchall()
        completed = get_metadata(conn, 'completed_at')
        completed_slot = get_metadata(conn, 'completed_slot')
    return {
        'success': True,
        'data': {
            'items': [{'source': source, 'item': json.loads(payload),
                       'collectedAt': collected} for source, payload, collected in rows],
            'count': len(rows),
            'refreshedAt': completed,
            'stale': bool(slot and completed_slot != slot),
            'tradingDate': bool(slot),
            'calendarVerifiedThrough': '2026-12-31',
            'sourceStatus': [dict(zip(
                ('source', 'lastAttemptAt', 'lastSuccessAt', 'lastCount', 'lastError'), row))
                for row in source_rows],
        },
    }


def article_id(source: str, item: dict) -> str:
    identity = str(item.get('url') or item.get('link') or item.get('news_url')
                   or item.get('id') or item.get('code') or '')
    if not identity:
        identity = '|'.join(str(item.get(field, '')) for field in
                            ('title', 'content', 'publish_time', 'time'))
    return hashlib.sha256((source + '\0' + identity).encode()).hexdigest()


def refresh() -> int:
    slot = current_slot()
    if not slot:
        print('No verified trading session today; leaving cache unchanged.', flush=True)
        return 0
    LOCK_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOCK_PATH.open('w') as lockfile:
        try:
            fcntl.flock(lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('News refresh already running.', flush=True)
            return 0
        with connect() as conn:
            if (get_metadata(conn, 'completed_slot') == slot and
                    get_metadata(conn, 'completed_policy') == CACHE_POLICY_VERSION):
                print('This half-hour slot is already complete.', flush=True)
                return 0
        key = KEY_PATH.read_text().strip()
        if not key:
            raise RuntimeError('Gateway key is missing')
        succeeded = 0
        with httpx.Client(timeout=45, headers={'x-api-key': key}) as client:
            for source in SOURCES:
                now = datetime.now(timezone.utc).isoformat()
                error = None
                items = []
                try:
                    response = client.post(BASE_URL + '/api/v1/spiders/run', json={
                        'spider_name': source,
                        'params': SOURCE_PARAMS.get(source, {'page_size': 20})})
                    payload = response.json()
                    candidate = payload.get('data', {}).get('news_list')
                    if response.status_code != 200 or payload.get('success') is not True:
                        error = payload.get('error') or f'HTTP_{response.status_code}'
                    elif not isinstance(candidate, list):
                        error = 'missing_news_list'
                    elif not candidate:
                        error = 'empty_news_list'
                    else:
                        items = [item for item in candidate if isinstance(item, dict)]
                        if not items:
                            error = 'no_valid_items'
                except (httpx.HTTPError, ValueError, TypeError) as exc:
                    error = type(exc).__name__
                with connect() as conn:
                    if error:
                        conn.execute('INSERT INTO source_status(source,last_attempt_at,last_error) '
                                     'VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET '
                                     'last_attempt_at=excluded.last_attempt_at, '
                                     'last_error=excluded.last_error', (source, now, error))
                    else:
                        for item in items:
                            conn.execute('INSERT INTO articles(article_id,source,payload,collected_at) '
                                         'VALUES(?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET '
                                         'payload=excluded.payload,collected_at=excluded.collected_at',
                                         (article_id(source, item), source,
                                          json.dumps(item, ensure_ascii=False), now))
                        conn.execute('INSERT INTO source_status '
                                     '(source,last_attempt_at,last_success_at,last_count,last_error) '
                                     'VALUES(?,?,?,?,NULL) ON CONFLICT(source) DO UPDATE SET '
                                     'last_attempt_at=excluded.last_attempt_at, '
                                     'last_success_at=excluded.last_success_at, '
                                     'last_count=excluded.last_count,last_error=NULL',
                                     (source, now, now, len(items)))
                        succeeded += 1
                print(f'{source}: {len(items)} items' if not error else
                      f'{source}: {error}', flush=True)
                time.sleep(1)
        with connect() as conn:
            # Failed sources retain their last good articles. A slot is complete
            # only if at least one source produced a fresh nonempty list.
            if succeeded:
                set_metadata(conn, 'completed_slot', slot)
                set_metadata(conn, 'completed_policy', CACHE_POLICY_VERSION)
                set_metadata(conn, 'completed_at', datetime.now(timezone.utc).isoformat())
            set_metadata(conn, 'last_run_success_count', str(succeeded))
        print(f'Slot {slot}: {succeeded}/{len(SOURCES)} sources refreshed.', flush=True)
        return 0 if succeeded else 1


def sync_to_supabase() -> None:
    """Send the saved snapshot outbound; never expose the ECS gateway publicly."""
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SECRET_KEY', '') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url.startswith('https://') or not key:
        raise RuntimeError('SUPABASE_URL and a Supabase server key are required')
    with connect() as conn:
        completed_at = get_metadata(conn, 'completed_at')
        if not completed_at:
            print('No completed snapshot to sync yet.', flush=True)
            return
        if (get_metadata(conn, 'supabase_synced_at') == completed_at and
                get_metadata(conn, 'supabase_synced_policy') == CACHE_POLICY_VERSION):
            print('Snapshot already synced to Supabase.', flush=True)
            return
    snapshot = read_feed(limit=500)
    headers = {
        'apikey': key,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    }
    if not key.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + key
    response = httpx.post(
        url + '/rest/v1/omnidata_news_snapshots?on_conflict=id',
        headers=headers,
        json={
            'id': 'current', 'payload': snapshot,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        },
        timeout=45,
    )
    if not response.is_success:
        # Do not log response bodies: hosted services may echo request details.
        raise RuntimeError(f'Supabase snapshot sync failed: HTTP {response.status_code}')
    with connect() as conn:
        set_metadata(conn, 'supabase_synced_at', completed_at)
        set_metadata(conn, 'supabase_synced_policy', CACHE_POLICY_VERSION)
    print(f'Snapshot synced to Supabase: {snapshot["data"]["count"]} articles.', flush=True)


if __name__ == '__main__':
    status = refresh()
    try:
        sync_to_supabase()
    except (httpx.HTTPError, RuntimeError) as exc:
        print(f'Snapshot sync error: {type(exc).__name__}: {exc}', file=sys.stderr)
        status = 1
    sys.exit(status)
