const jsonHeaders = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function restUrl(path) {
  return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
}

async function getProfile(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const userResponse = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: authorization }
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await fetch(restUrl(`profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`), {
    headers: jsonHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
  const profiles = await profileResponse.json();
  return profiles[0] ? { user, profile: profiles[0] } : null;
}

function sendJson(res, status, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(data);
}

module.exports = { configured, getProfile, jsonHeaders, restUrl, sendJson };
