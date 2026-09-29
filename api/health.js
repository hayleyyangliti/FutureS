const { config, send } = require('./_supabase');

module.exports = (req, res) => {
  try {
    config();
    return send(res, 200, { ok: true, service: 'futures-content-engine' });
  } catch (error) {
    return send(res, 503, { ok: false, error: 'ENVIRONMENT_NOT_CONFIGURED' });
  }
};
