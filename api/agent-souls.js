const { currentProfile, send, supabase } = require('./_supabase');

const SOUL_NAMES = ['总编辑', '研究君', '内容君', '审查君'];
const defaults = {
  '总编辑': '你是总编辑。负责将经核验的研究信息转化为清晰、可执行且合规的生产任务。',
  '研究君': '你是研究君。负责从可追溯资料中提取事实、研究逻辑与期货传导边界。',
  '内容君': '你是内容君。负责在事实边界内，学习匹配案例的品牌表达并完成初稿。',
  '审查君': '你是审查君。负责核验事实、来源、风险提示与合规表达。',
};
const clean = (value, max = 12000) => String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
const keyFor = (name) => `agent_soul:${name}`;

async function storedSouls() {
  const rows = await supabase('/rest/v1/prompt_overrides?owner_id=is.null&prompt_key=like.agent_soul%3A%25&select=prompt_key,content,updated_at');
  return (Array.isArray(rows) ? rows : []).reduce((all, row) => {
    const name = String(row.prompt_key || '').replace(/^agent_soul:/, '');
    if (SOUL_NAMES.includes(name) && clean(row.content)) all[name] = { content: clean(row.content), updatedAt: row.updated_at || null };
    return all;
  }, {});
}

module.exports = async (req, res) => {
  try {
    const { profile } = await currentProfile(req);
    // Soul instructions can shape production behavior, so they are never
    // exposed to ordinary users and are only writable by administrators.
    if (profile.role !== 'developer') return send(res, 403, { error: 'ADMIN_ONLY' });
    const saved = await storedSouls();
    if (req.method === 'GET') {
      return send(res, 200, { souls: SOUL_NAMES.map((name) => ({ name, content: saved[name]?.content || defaults[name], updatedAt: saved[name]?.updatedAt || null })) });
    }
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = clean(body.name, 20), content = clean(body.content);
      if (!SOUL_NAMES.includes(name) || content.length < 80) return send(res, 400, { error: 'INVALID_SOUL' });
      const existing = saved[name];
      const now = new Date().toISOString();
      const path = `/rest/v1/prompt_overrides?owner_id=is.null&prompt_key=eq.${encodeURIComponent(keyFor(name))}`;
      const headers = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
      const rows = existing
        ? await supabase(path, { method: 'PATCH', headers, body: JSON.stringify({ content, updated_at: now }) })
        : await supabase('/rest/v1/prompt_overrides', { method: 'POST', headers, body: JSON.stringify({ owner_id: null, prompt_key: keyFor(name), content, updated_at: now }) });
      return send(res, 200, { soul: { name, content: rows?.[0]?.content || content, updatedAt: rows?.[0]?.updated_at || now } });
    }
    return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    if (error instanceof SyntaxError) return send(res, 400, { error: 'INVALID_REQUEST_BODY' });
    console.error('Agent soul request failed', error);
    return send(res, 500, { error: 'SOUL_SERVICE_UNAVAILABLE' });
  }
};
