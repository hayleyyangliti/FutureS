const { currentProfile, send } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const { profile } = await currentProfile(req);
    return send(res, 200, { profile });
  } catch (error) {
    return send(res, error.message === 'UNAUTHORIZED' ? 401 : 403, { error: error.message });
  }
};
