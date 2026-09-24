const { jsonHeaders, restUrl, sendJson } = require('../_supabase');

module.exports = async function login(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' });
  const { employeeNo, password } = req.body || {};
  const workNo = String(employeeNo || '').trim();
  if (!/^\d+$/.test(workNo) || !password) return sendJson(res, 400, { error: '请输入工号和密码。' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.LOGIN_EMAIL_DOMAIN) {
    return sendJson(res, 503, { error: '登录服务环境变量尚未配置。' });
  }
  const profileResponse = await fetch(restUrl(`profiles?employee_no=eq.${encodeURIComponent(workNo)}&select=email_prefix&limit=1`), {
    headers: jsonHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
  const profiles = await profileResponse.json();
  if (!profileResponse.ok || !profiles[0]?.email_prefix) return sendJson(res, 401, { error: '工号或密码错误。' });
  const email = `${profiles[0].email_prefix}@${process.env.LOGIN_EMAIL_DOMAIN}`;
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (!response.ok) return sendJson(res, response.status, { error: '工号或密码错误。' });
  return sendJson(res, 200, { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in });
};
