const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function config(requireServiceKey = true) {
  const expected = requireServiceKey ? [...required, 'SUPABASE_SERVICE_ROLE_KEY'] : required;
  const missing = expected.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  // Secrets pasted in hosting consoles occasionally retain whitespace.
  // Normalize them server-side so a harmless trailing newline cannot turn
  // into an opaque network or header error.
  return {
    url: String(process.env.SUPABASE_URL).trim().replace(/\/$/, ''),
    anonKey: String(process.env.SUPABASE_ANON_KEY).trim(),
    serviceKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  };
}

function send(res, status, payload) {
  res.status(status).json(payload);
}

function timeoutError() {
  const error = new Error('SUPABASE_UPSTREAM_TIMEOUT');
  error.code = 'UPSTREAM_TIMEOUT';
  error.status = 504;
  return error;
}

async function upstreamFetch(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const parentSignal = options.signal;
  const abort = () => controller.abort();
  if (parentSignal) parentSignal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw timeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener('abort', abort);
  }
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
  const response = await upstreamFetch(`${url}${path}`, { ...options, headers });
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
  const response = await upstreamFetch(`${url}/rest/v1/rpc/current_profile`, {
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
  // The RPC above validates this exact JWT. Only then read server-managed
  // app_metadata; never authorize using editable user_metadata.
  let claims={};try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch(_){}
  // This is an explicitly approved operational administrator. Keep the
  // exception server-side; client-provided metadata is never trusted.
  if(profile.email_prefix?.toLowerCase()==='futures'){
    profile.role='developer';
  } else if(claims.app_metadata?.access_mode==='viewer'){
    profile.role='viewer';
    if(!['GET','HEAD'].includes(req.method||'GET')){const error=new Error('READ_ONLY_ACCOUNT');error.status=403;throw error;}
  }
  return { user: { id: profile.auth_user_id }, profile };
}

module.exports = { config, send, supabase, currentProfile, upstreamFetch };

