const { config, send, supabase } = require('../_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^\s@]+@gtht\.com$/.test(email) || !password) return send(res, 400, { error: 'INVALID_CREDENTIALS' });

    const { url, anonKey } = config();
    const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      // 密码授权属于 Supabase Auth 的普通登录流程，使用 Publishable key。
      // Secret key 仅用于服务端访问资料表，不参与用户密码校验。
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
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

    if (!tokenData.user?.id) return send(res, 401, { error: 'INVALID_CREDENTIALS' });
    const rows = await supabase(`/rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(tokenData.user.id)}&select=*`, {
      headers: { Accept: 'application/json' },
    });
    let profile = rows?.[0];
    // A Supabase user recreated with the same company email receives a new UID.
    // Reconnect the existing profile only after that email has passed password
    // authentication, so an administrator does not have to repair IDs manually.
    if (!profile) {
      const emailPrefix = email.slice(0, email.indexOf('@'));
      const fallbackRows = await supabase(`/rest/v1/profiles?email_prefix=eq.${encodeURIComponent(emailPrefix)}&select=*`, {
        headers: { Accept: 'application/json' },
      });
      const fallback = fallbackRows?.[0];
      if (fallback) {
        const updated = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(fallback.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ auth_user_id: tokenData.user.id, updated_at: new Date().toISOString() }),
        });
        profile = updated?.[0] || fallback;
      }
    }
    if (!profile) return send(res, 403, { error: 'PROFILE_NOT_FOUND' });
    return send(res, 200, { accessToken: tokenData.access_token, profile });
  } catch (error) {
    console.error('login failed', error);
    return send(res, 500, { error: 'LOGIN_UNAVAILABLE' });
  }
};
