const assert = require('node:assert/strict');
const { test } = require('node:test');
const handler = require('../api/ai/generate');

async function invoke(model, keys = {}) {
  const previousFetch = global.fetch;
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'MINIMAX_API_KEY', 'DEEPSEEK_API_KEY'];
  const previousEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'public-test',
  });
  for (const name of ['MINIMAX_API_KEY', 'DEEPSEEK_API_KEY']) {
    if (keys[name]) process.env[name] = keys[name];
    else delete process.env[name];
  }
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes('/rest/v1/rpc/current_profile')) {
      return { ok: true, json: async () => [{ auth_user_id: 'test-user' }] };
    }
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"title":"测试标题","body":"测试正文","sources":[]}' } }] }),
    };
  };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { topic: '测试选题', model } }, res);
    return { code: res.code, body: res.body, calls };
  } finally {
    global.fetch = previousFetch;
    for (const name of names) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  }
}

test('MiniMax remains the default and uses only its own server key', async () => {
  const result = await invoke(undefined, { MINIMAX_API_KEY: 'minimax-test', DEEPSEEK_API_KEY: 'deepseek-test' });
  assert.equal(result.code, 200);
  assert.equal(result.body.provider, 'MiniMax');
  assert.equal(result.calls[1].url, 'https://api.minimaxi.com/v1/text/chatcompletion_v2');
  assert.equal(result.calls[1].options.headers.Authorization, 'Bearer minimax-test');
  assert.equal(JSON.parse(result.calls[1].options.body).model, 'MiniMax-M2.7');
});

test('DeepSeek uses its own endpoint, server key and JSON response format', async () => {
  const result = await invoke('DeepSeek', { MINIMAX_API_KEY: 'minimax-test', DEEPSEEK_API_KEY: 'deepseek-test' });
  assert.equal(result.code, 200);
  assert.equal(result.body.provider, 'DeepSeek');
  assert.equal(result.calls[1].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(result.calls[1].options.headers.Authorization, 'Bearer deepseek-test');
  const request = JSON.parse(result.calls[1].options.body);
  assert.equal(request.model, 'deepseek-flash');
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.equal(request.max_tokens, 2400);
  assert.equal('max_completion_tokens' in request, false);
});

test('DeepSeek is not silently sent to MiniMax when its key is absent', async () => {
  const result = await invoke('DeepSeek', { MINIMAX_API_KEY: 'minimax-test' });
  assert.equal(result.code, 503);
  assert.equal(result.body.error, 'DEEPSEEK_NOT_CONFIGURED');
  assert.equal(result.calls.length, 1);
});

test('unknown model is rejected before an upstream request', async () => {
  const result = await invoke('untrusted-model', { MINIMAX_API_KEY: 'minimax-test', DEEPSEEK_API_KEY: 'deepseek-test' });
  assert.equal(result.code, 400);
  assert.equal(result.body.error, 'UNSUPPORTED_MODEL');
  assert.equal(result.calls.length, 1);
});
