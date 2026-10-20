"""Regression: a late/high-volume source must not evict smaller sources."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

with patch.dict(sys.modules, {'httpx': Mock()}):
    import omnidata_news_cache as cache


class FeedCoverageTest(unittest.TestCase):
    def test_late_large_source_does_not_starve_domestic_reports(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(cache, 'DB_PATH', Path(folder) / 'cache.sqlite3'):
            with cache.connect() as conn:
                for source, count, collected in [('domestic', 20, '2026-10-20T00:00:00Z'), ('late', 600, '2026-10-20T01:00:00Z')]:
                    for index in range(count):
                        payload = json.dumps({'title': f'{source}-{index}', 'pub_time': f'2026-10-20 08:{index % 60:02d}:00'})
                        conn.execute('INSERT INTO articles VALUES(?,?,?,?)', (f'{source}-{index}', source, payload, collected))
            feed = cache.read_feed(limit=500)['data']
            self.assertEqual(feed['count'], 500)
            self.assertEqual(sum(item['source'] == 'domestic' for item in feed['items']), 20)
            self.assertEqual(feed['items'][1]['item']['pub_time'], '2026-10-20 08:19:00')


if __name__ == '__main__':
    unittest.main()
