const { configured, getProfile, jsonHeaders, restUrl, sendJson } = require('./_supabase');
const allowedFields = ['content_type', 'subtype', 'title', 'folder_path', 'content_platform_id', 'content', 'attachments', 'sources'];

module.exports = async function cases(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!configured()) return sendJson(res, 503, { error: 'Supabase 环境变量尚未配置。' });
  const identity = await getProfile(req);
  if (!identity) return sendJson(res, 401, { error: '请先登录。' });
  const { profile } = identity;

  try {
    if (req.method === 'GET') {
      const scope = profile.role === 'developer'
        ? 'select=*&order=saved_at.desc'
        : `select=*&or=(library.eq.shared,owner_id.eq.${profile.id})&order=saved_at.desc`;
      const response = await fetch(restUrl(`content_cases?${scope}`), { headers: jsonHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY) });
      const data = await response.json();
      return sendJson(res, response.ok ? 200 : response.status, response.ok ? { data } : { error: data.message || '读取案例失败。' });
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const record = Object.fromEntries(Object.entries(body).filter(([key]) => allowedFields.includes(key)));
      const requestedLibrary = body.library === 'personal' ? 'personal' : 'shared';
      if (!record.title || !record.content_type || !record.content) return sendJson(res, 400, { error: 'title、content_type 和 content 为必填字段。' });
      if (requestedLibrary === 'shared' && profile.role !== 'developer') return sendJson(res, 403, { error: '普通使用者不能直接保存至百宝箱，请提交内容申请。' });
      const response = await fetch(restUrl('content_cases'), {
        method: 'POST',
        headers: { ...jsonHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=representation' },
        body: JSON.stringify({
          ...record,
          library: requestedLibrary,
          owner_id: profile.id,
          attachments: Array.isArray(record.attachments) ? record.attachments : [],
          sources: Array.isArray(record.sources) ? record.sources : []
        })
      });
      const data = await response.json();
      return sendJson(res, response.ok ? 201 : response.status, response.ok ? { data: data[0] } : { error: data.message || '保存案例失败。' });
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  } catch (error) {
    return sendJson(res, 500, { error: '接口请求失败。', detail: error.message });
  }
};
