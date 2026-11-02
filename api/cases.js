const { currentProfile, send, supabase } = require('./_supabase');

module.exports = async (req, res) => {
  try {
    const { profile } = await currentProfile(req);
    if (req.method === 'GET') {
      const library = req.query.library === 'personal' ? 'personal' : 'shared';
      const ownerFilter=library==='personal'?`&owner_id=eq.${encodeURIComponent(profile.id)}`:'';
      const rows = await supabase(`/rest/v1/content_cases?library=eq.${library}${ownerFilter}&order=saved_at.desc&select=*`, {
        headers: { Accept: 'application/json' },
      });
      return send(res, 200, { cases: rows });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.title || !body.content || !body.contentType) return send(res, 400, { error: 'MISSING_REQUIRED_FIELDS' });
      const record = {
        library: body.library === 'personal' ? 'personal' : 'shared',
        owner_id: profile.id,
        content_type: body.contentType,
        subtype: body.subtype || null,
        title: body.title,
        folder_path: body.folderPath || '未归档',
        content_platform_id: body.contentPlatformId || null,
        content: body.content,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        sources: Array.isArray(body.sources) ? body.sources : [],
        starred: Boolean(body.starred),
      };
      const rows = await supabase('/rest/v1/content_cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(record),
      });
      return send(res, 201, { case: rows?.[0] });
    }
    if (req.method === 'PATCH') {
      const body = req.body || {}, id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id) || !body.title || !body.content || !body.contentType) return send(res, 400, { error: 'MISSING_REQUIRED_FIELDS' });
      const record = {
        content_type: body.contentType,
        subtype: body.subtype || null,
        title: body.title,
        folder_path: body.folderPath || '未归档',
        content_platform_id: body.contentPlatformId || null,
        content: body.content,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        sources: Array.isArray(body.sources) ? body.sources : [],
        starred: Boolean(body.starred),
        updated_at: new Date().toISOString(),
      };
      const rows = await supabase(`/rest/v1/content_cases?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(profile.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(record),
      });
      if (!rows?.[0]) return send(res, 404, { error: 'CASE_NOT_FOUND' });
      return send(res, 200, { case: rows[0] });
    }
    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return send(res, 400, { error: 'INVALID_CASE_ID' });
      const rows = await supabase(`/rest/v1/content_cases?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(profile.id)}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' },
      });
      if (!rows?.[0]) return send(res, 404, { error: 'CASE_NOT_FOUND' });
      return send(res, 200, { deleted: id });
    }
    return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    if(error.message==='READ_ONLY_ACCOUNT')return send(res,403,{error:'READ_ONLY_ACCOUNT'});
    return send(res, error.message === 'UNAUTHORIZED' ? 401 : 500, { error: 'REQUEST_FAILED' });
  }
};

