const { currentProfile, send } = require('../_supabase');

// Dataphin 的具体开放 API 路径和鉴权方式由企业侧确定。这里作为唯一的
// 服务端转接点：浏览器只调用本站 API，不会获得 Dataphin 令牌。
function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    await currentProfile(req);
    const endpoint = clean(process.env.DATAPHIN_DASHBOARD_URL, 2000);
    const token = clean(process.env.DATAPHIN_API_TOKEN, 2000);
    if (!endpoint || !token) return send(res, 503, { error: 'DATAPHIN_NOT_CONFIGURED' });

    const url = new URL(endpoint);
    ['contentId', 'contentType', 'scope', 'platform'].forEach((key) => {
      const value = clean(req.query?.[key]);
      if (value) url.searchParams.set(key, value);
    });
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('Dataphin dashboard request failed', { status: response.status });
      return send(res, 502, { error: 'DATAPHIN_REQUEST_FAILED' });
    }
    return send(res, 200, { data: payload, fetchedAt: new Date().toISOString() });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    if (error.message === 'PROFILE_NOT_FOUND') return send(res, 403, { error: 'PROFILE_NOT_FOUND' });
    if (error.name === 'AbortError') return send(res, 504, { error: 'DATAPHIN_TIMEOUT' });
    console.error('Dataphin dashboard unavailable', error);
    return send(res, 500, { error: 'DATAPHIN_UNAVAILABLE' });
  }
};
