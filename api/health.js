module.exports = async function health(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    service: 'futures-content-engine-api',
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    authConfigured: Boolean(process.env.SUPABASE_ANON_KEY && process.env.LOGIN_EMAIL_DOMAIN),
    timestamp: new Date().toISOString()
  });
};
