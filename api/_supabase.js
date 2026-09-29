const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

function config() {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  return {
    url: process.env.SUPABASE_URL.replace(/\/$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function send(res, status, payload) {
  res.status(status).json(payload);
}

async function supabase(path, options = {}, useServiceKey = true) {
  const { url, anonKey, serviceKey } = config();
  const headers = {
    apikey: useServiceKey ? serviceKey : anonKey,
    ...(options.headers || {}),
  };
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const raw = await response.text();
  let body = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) {}
  if (!response.ok) {
    const message = body?.message || body?.msg || `Supabase request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function currentProfile(req) {
  const token = bearer(req);
  if (!token) throw new Error('UNAUTHORIZED');
  const user = await supabase('/auth/v1/user', { headers: { Authorization: `Bearer ${token}` } }, false);
  const rows = await supabase(`/rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=*`, {
    headers: { Accept: 'application/json' },
  });
  if (!rows?.[0]) throw new Error('PROFILE_NOT_FOUND');
  return { user, profile: rows[0] };
}

module.exports = { config, send, supabase, currentProfile };
