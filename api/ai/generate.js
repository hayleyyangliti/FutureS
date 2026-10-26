const { currentProfile, send } = require('../_supabase');

const ENDPOINTS = { MiniMax: 'https://api.minimaxi.com/v1/text/chatcompletion_v2', DeepSeek: 'https://api.deepseek.com/chat/completions' };
const MAX_INPUT_LENGTH = 8000;
const clean = (value, max = MAX_INPUT_LENGTH) => String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
function json(content, fallback = {}) { const value = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); const start = value.indexOf('{'), end = value.lastIndexOf('}'); if (start >= 0 && end > start) try { return JSON.parse(value.slice(start, end + 1)); } catch (_) {} return fallback; }
function settings(provider) { const deep = provider === 'DeepSeek', key = clean(process.env[deep ? 'DEEPSEEK_API_KEY' : 'MINIMAX_API_KEY'], 1000); if (!key) throw Error(deep ? 'DEEPSEEK_NOT_CONFIGURED' : 'MINIMAX_NOT_CONFIGURED'); return { deep, key, model: deep ? (process.env.DEEPSEEK_MODEL || 'deepseek-flash') : (process.env.MINIMAX_MODEL || 'MiniMax-M2.7') }; }
async function ask(provider, system, user, maxTokens = 900) {
  const config = settings(provider), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(ENDPOINTS[provider], { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model, stream: false, temperature: .35, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(config.deep ? { max_tokens: maxTokens, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } } : { max_completion_tokens: maxTokens }) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.base_resp?.status_code) throw Error(config.deep ? 'DEEPSEEK_REQUEST_FAILED' : 'MINIMAX_REQUEST_FAILED');
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw Error(config.deep ? 'DEEPSEEK_EMPTY_RESPONSE' : 'MINIMAX_EMPTY_RESPONSE');
    return { content, model: config.model };
  } finally { clearTimeout(timer); }
}
function productionPrompt({ topic, instruction, contentType, subtype, candidateMode, plan, profile }) {
  const format = candidateMode ? '{"candidates":[{"title":"候选标题","body":"候选正文"},{"title":"候选标题","body":"候选正文"},{"title":"候选标题","body":"候选正文"}]}' : '{"title":"内容标题","body":"可直接编辑的完整正文","sources":["用户明确提供的来源名称"]}';
  return `请为期市内容引擎撰写中文期货市场内容。仅输出 JSON：${format}\n内容类型：${contentType}\n具体场景：${subtype || '未指定'}\n选题：${topic || '未指定'}\n生成指令：${instruction || '围绕选题生成专业、克制、可供人工编辑的内容。'}\n研究规划：${plan}\n用户已确认的表达偏好：${profile || '暂无，按专业、克制、清晰执行。'}\n硬性要求：只能基于输入事实；缺少事实时使用待核验表述，绝不杜撰数据、日期、来源或机构观点；不提供买卖指令或收益承诺；正文为纯文本；资料来源仅填写用户明确提供的名称；${contentType === 'Push' ? '每条正文35—55个汉字并以“投资有风险，入市需谨慎”收尾。' : '不在正文重复风险提示，系统将统一追加。'}`;
}
function cleanResult(value, topic, candidateMode) { if (candidateMode) { const candidates = (value.candidates || []).map(x => ({ title: clean(x?.title, 160), body: clean(x?.body, 3000) })).filter(x => x.body).slice(0, 3); if (!candidates.length) throw Error('MODEL_INVALID_RESPONSE'); return { candidates }; } const body = clean(value.body, 12000); if (!body) throw Error('MODEL_INVALID_RESPONSE'); return { title: clean(value.title, 200) || topic || '期市内容初稿', body, sources: Array.isArray(value.sources) ? value.sources.map(x => clean(x, 200)).filter(Boolean).slice(0, 5) : [] }; }
async function runAgents(input, provider) {
  const context = JSON.stringify({ topic: input.topic, instruction: input.instruction, contentType: input.contentType, subtype: input.subtype, learningProfile: input.learningProfile || '' });
  const research = await ask(provider, '你是研究 Agent。只依据输入内容，提取可写事实、缺失信息、不可推断内容和期货传导边界。只输出 JSON。', `${context}\n输出 {"facts":[],"gaps":[],"boundaries":[]}`, 600);
  const plan = await ask(provider, '你是总编辑 Agent。基于用户输入和研究结果拆解写作任务，给出内容结构、目标读者、篇幅与合规边界。只输出 JSON。', `${context}\n研究结果：${research.content}\n输出 {"outline":[],"tone":"","checks":[]}`, 650);
  const candidateMode = ['Push', '私域营销文案'].includes(input.contentType);
  const writer = await ask(provider, '你是内容写作 Agent。必须只输出指定 JSON，严禁捏造事实、来源、日期或数值。', productionPrompt({ ...input, candidateMode, plan: plan.content, profile: input.learningProfile }), candidateMode ? 1300 : 2800);
  const reviewer = await ask(provider, '你是审查 Agent。根据用户输入核查候选文案：删除无法由输入支持的事实、绝对化判断、投资建议和虚构来源；保留正确结构。只输出与输入完全同构的 JSON。', `用户输入：${context}\n写作初稿：${writer.content}\n输出 JSON。`, candidateMode ? 1300 : 2800);
  return { result: cleanResult(json(reviewer.content, json(writer.content, {})), input.topic, candidateMode), agentRun: [{ name: '研究君', status: 'completed' }, { name: '总编辑', status: 'completed' }, { name: '内容君', status: 'completed' }, { name: '审查君', status: 'completed' }], model: writer.model };
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    await currentProfile(req);
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}), provider = clean(raw.model, 40) || 'MiniMax';
    if (!ENDPOINTS[provider]) return send(res, 400, { error: 'UNSUPPORTED_MODEL' });
    const input = { topic: clean(raw.topic, 1000), instruction: clean(raw.instruction), contentType: clean(raw.contentType, 80) || '营销页面文案', subtype: clean(raw.subtype, 120), learningProfile: clean(raw.learningProfile, 1800) };
    if (!input.topic && !input.instruction) return send(res, 400, { error: 'GENERATION_INPUT_REQUIRED' });
    const output = await runAgents(input, provider);
    return send(res, 200, { ...output.result, model: output.model, provider, agentRun: output.agentRun });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    if (error.message === 'READ_ONLY_ACCOUNT') return send(res, 403, { error: 'READ_ONLY_ACCOUNT' });
    if (error.message === 'PROFILE_NOT_FOUND') return send(res, 403, { error: 'PROFILE_NOT_FOUND' });
    if (error instanceof SyntaxError) return send(res, 400, { error: 'INVALID_REQUEST_BODY' });
    if (error.name === 'AbortError') return send(res, 504, { error: 'AI_GENERATION_TIMEOUT' });
    if (/^(MINIMAX|DEEPSEEK|MODEL)_/.test(error.message)) return send(res, 502, { error: error.message });
    console.error('AI generation unavailable', error); return send(res, 500, { error: 'AI_GENERATION_UNAVAILABLE' });
  }
};
module.exports._test = { clean, json, cleanResult, productionPrompt };
