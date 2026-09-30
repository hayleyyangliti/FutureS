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

    const { url, serviceKey } = config();
    const domain = process.env.LOGIN_EMAIL_DOMAIN || 'gtht.com';
    const email = `${profile.email_prefix}@${domain}`;
    const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      // 此请求仅在 Vercel 服务端执行，使用 Secret key 可避免前端发布密钥
      // 填写错误或轮换后导致的密码授权失败。
      headers: { apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const rawTokenData = await tokenResponse.text();
    let tokenData;
    try { tokenData = rawTokenData ? JSON.parse(rawTokenData) : {}; } catch (_) { tokenData = {}; }
    if (!tokenResponse.ok || !tokenData.access_token) {
      // 不记录密码、Token 或 Key；仅记录 Supabase 返回的安全诊断信息。
      const message = tokenData.error_description || tokenData.msg || tokenData.message || '';
      const configurationIssue = /api key|apikey|jwt/i.test(message);
      console.warn('Supabase password grant rejected', {
        status: tokenResponse.status,
        error: tokenData.error || null,
        message: message || null,
      });
      return send(res, 401, {
        error: configurationIssue ? 'SUPABASE_KEY_REJECTED' : 'INVALID_CREDENTIALS',
      });
    }

    return send(res, 200, { accessToken: tokenData.access_token, profile });
  } catch (error) {
    console.error('login failed', error);
    return send(res, 500, { error: 'LOGIN_UNAVAILABLE' });
  }
};
