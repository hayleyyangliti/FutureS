const { config, send, supabase } = require('../_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const employeeNo = String(req.body?.employeeNo || '').trim();
    const password = String(req.body?.password || '');
    if (!/^\d+$/.test(employeeNo) || !password) return send(res, 400, { error: 'INVALID_CREDENTIALS' });

    const rows = await supabase(`/rest/v1/profiles?employee_no=eq.${encodeURIComponent(employeeNo)}&select=*`, {
      headers: { Accept: 'application/json' },
    });
    const profile = rows?.[0];
    if (!profile?.email_prefix) return send(res, 401, { error: 'INVALID_CREDENTIALS' });

    const { url, anonKey } = config();
    const domain = process.env.LOGIN_EMAIL_DOMAIN || 'gtht.com';
    const email = `${profile.email_prefix}@${domain}`;
    const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const rawTokenData = await tokenResponse.text();
    let tokenData;
    try { tokenData = rawTokenData ? JSON.parse(rawTokenData) : {}; } catch (_) { tokenData = {}; }
    if (!tokenResponse.ok || !tokenData.access_token) {
      // 不记录密码、Token 或 Key；仅记录 Supabase 返回的安全诊断信息。
      console.warn('Supabase password grant rejected', {
        status: tokenResponse.status,
        error: tokenData.error || null,
        message: tokenData.error_description || tokenData.msg || tokenData.message || null,
      });
      return send(res, 401, { error: 'INVALID_CREDENTIALS' });
    }

    return send(res, 200, { accessToken: tokenData.access_token, profile });
  } catch (error) {
    console.error('login failed', error);
    return send(res, 500, { error: 'LOGIN_UNAVAILABLE' });
  }
};
