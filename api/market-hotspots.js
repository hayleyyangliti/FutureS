const { currentProfile, send } = require('./_supabase');

const OMNIDATA_SPIDER = 'eastmoney_fast_news';

function pickItems(payload) {
  const data = payload?.data;
  const candidates = [
    data,
    data?.items,
    data?.list,
    data?.news,
    data?.data,
    payload?.items,
    payload?.list,
  ];
  return candidates.find(Array.isArray) || [];
}

function normalize(item, index) {
  const title = item?.title || item?.news_title || item?.newsTitle || item?.content || '未命名市场快讯';
  const summary = item?.summary || item?.digest || item?.content || title;
  const sourceUrl = item?.url || item?.link || item?.news_url || '';
  const publishedAt = item?.publish_time || item?.publishTime || item?.time || item?.datetime || '';
  return {
    id: String(item?.id || item?.code || index),
    title: String(title),
    summary: String(summary),
    source: String(item?.source || item?.media || '东方财富快讯'),
    sourceUrl: String(sourceUrl),
    publishedAt: String(publishedAt),
    category: '期货',
    grade: 'B类·待复核',
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    // The caller must already be a signed-in Futures user. The OmniData token
    // remains on Vercel and is never returned to the browser.
    await currentProfile(req);

    const baseUrl = (process.env.OMNIDATA_BASE_URL || '').replace(/\/$/, '');
    const apiToken = (process.env.OMNIDATA_API_TOKEN || '').trim();
    if (!baseUrl || !apiToken) return send(res, 503, { error: 'OMNIDATA_NOT_CONFIGURED' });

    const response = await fetch(`${baseUrl}/api/v1/spiders/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-omnidata-token': apiToken,
      },
      body: JSON.stringify({
        spider_name: OMNIDATA_SPIDER,
        params: { page_size: 20, fast_column: '113' },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      console.error('OmniData hotspot request failed', {
        status: response.status,
        detail: payload?.detail || payload?.error || null,
        spider: OMNIDATA_SPIDER,
      });
      return send(res, 502, { error: 'OMNIDATA_REQUEST_FAILED' });
    }

    return send(res, 200, {
      items: pickItems(payload).slice(0, 20).map(normalize),
      refreshedAt: new Date().toISOString(),
      source: '东方财富期货快讯',
    });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    return send(res, 500, { error: 'MARKET_HOTSPOTS_UNAVAILABLE' });
  }
};
