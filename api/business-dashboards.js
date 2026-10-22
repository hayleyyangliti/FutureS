const { currentProfile, send } = require('./_supabase');

const DASHBOARDS = {
  analyst: { env: 'BI_DASHBOARD_ANALYST_URL', rid: '690' },
  push: { env: 'BI_DASHBOARD_PUSH_URL', rid: '691' },
  'event-id': { env: 'BI_DASHBOARD_EVENT_ID_URL', rid: '612' },
};

function configuredUrl(value, expectedRid) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'bi.gtjaqh.net' ||
        url.pathname !== '/dash/integration/13' ||
        url.searchParams.get('rid') !== expectedRid ||
        url.searchParams.get('hideTitle') !== 'true' ||
        !url.searchParams.get('token')) return '';
    return url.toString();
  } catch (_) { return ''; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    await currentProfile(req);
    const urls = Object.fromEntries(Object.entries(DASHBOARDS)
      .map(([id, config]) => [id, configuredUrl(process.env[config.env] || '', config.rid)])
      .filter(([, value]) => value));
    return send(res, 200, { urls });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    console.warn('Business dashboard links unavailable', { name: error.name });
    return send(res, 503, { error: 'DASHBOARD_LINKS_UNAVAILABLE' });
  }
};

module.exports._test = { configuredUrl };
