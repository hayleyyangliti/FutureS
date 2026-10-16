const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function config(requireServiceKey = true) {
  const expected = requireServiceKey ? [...required, 'SUPABASE_SERVICE_ROLE_KEY'] : required;
  const missing = expected.filter((name) => !process.env[name]);
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
  const { url, anonKey, serviceKey } = config(useServiceKey);
  const headers = {
    apikey: useServiceKey ? serviceKey : anonKey,
    ...(options.headers || {}),
  };
  // Legacy service_role keys are JWTs: PostgREST evaluates their role from
  // Authorization, while newer sb_secret_ keys belong only in apikey.
  if (useServiceKey && /^[^.]+\.[^.]+\.[^.]+$/.test(serviceKey) && !headers.Authorization) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const raw = await response.text();
  let body = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) {}
  if (!response.ok) {
    const message = body?.message || body?.msg || `Supabase request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = body?.code || null;
    throw error;
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
  const { url, anonKey } = config(false);
  const response = await fetch(`${url}/rest/v1/rpc/current_profile`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error('UNAUTHORIZED');
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) throw new Error('PROFILE_NOT_FOUND');
  return { user: { id: profile.auth_user_id }, profile };
}

module.exports = { config, send, supabase, currentProfile };
