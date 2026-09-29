const { currentProfile, send, supabase } = require('./_supabase');

module.exports = async (req, res) => {
  try {
    const { profile } = await currentProfile(req);
    if (req.method === 'GET') {
      const library = req.query.library === 'personal' ? 'personal' : 'shared';
      const rows = await supabase(`/rest/v1/content_cases?library=eq.${library}&order=saved_at.desc&select=*`, {
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
      };
      const rows = await supabase('/rest/v1/content_cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(record),
      });
      return send(res, 201, { case: rows?.[0] });
    }
    return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return send(res, error.message === 'UNAUTHORIZED' ? 401 : 500, { error: 'REQUEST_FAILED' });
  }
};
