const { configured, getProfile, sendJson } = require('./_supabase');

module.exports = async function me(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });
  if (!configured()) return sendJson(res, 503, { error: 'Supabase 环境变量尚未配置。' });
  const identity = await getProfile(req);
  if (!identity) return sendJson(res, 401, { error: '登录已失效或账号未配置权限。' });
  const { profile } = identity;
  return sendJson(res, 200, { data: { id: profile.id, employeeNo: profile.employee_no, displayName: profile.display_name, emailPrefix: profile.email_prefix, department: profile.department, role: profile.role } });
};
