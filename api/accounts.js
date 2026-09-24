const { configured, getProfile, jsonHeaders, restUrl, sendJson } = require('./_supabase');

module.exports = async function accounts(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });
  if (!configured()) return sendJson(res, 503, { error: 'Supabase 环境变量尚未配置。' });
  const identity = await getProfile(req);
  if (!identity) return sendJson(res, 401, { error: '请先登录。' });
  if (identity.profile.role !== 'developer') return sendJson(res, 403, { error: '仅开发者可查看账号列表。' });
  const response = await fetch(restUrl('profiles?select=employee_no,display_name,email_prefix,department,role&order=employee_no.asc'), { headers: jsonHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY) });
  const data = await response.json();
  return sendJson(res, response.ok ? 200 : response.status, response.ok ? { data } : { error: '读取账号列表失败。' });
};
