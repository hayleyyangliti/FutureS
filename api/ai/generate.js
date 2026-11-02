const { currentProfile, send } = require('../_supabase');

const ENDPOINTS = { MiniMax: 'https://api.minimaxi.com/v1/text/chatcompletion_v2', DeepSeek: 'https://api.deepseek.com/chat/completions' };
const MAX_INPUT_LENGTH = 8000;
// Souls are the durable work contracts for the production chain.  They are
// deliberately server-side: the browser can describe a task, but cannot
// change what an Agent is allowed to infer or publish.
const AGENT_SOULS = {
  '研究君': '你是研究君。只基于用户提供的事实、公开来源和研报/资料摘要工作。先抽取事实与时间点，再给出期货品种的供需、宏观、政策、库存、运力或风险传导；明确区分事实、合理推演和待核验项。不得补写不存在的研报结论、数据、机构观点或投资建议。',
  '总编辑': '你是总编辑。把研究结果转换为可执行的内容任务：确定目标读者、核心问题、表达结构、篇幅、场景和合规边界；只保留有事实支撑的信息，要求内容君遵循对应案例的品牌表达，但不得照抄案例事实。',
  '内容君': '你是内容君。必须阅读输入的案例库样本，学习其标题长度、段落节奏、专业程度、品牌语气和固定风险提示的使用方式；只借鉴表达风格，不复制案例中的事实、数据或观点。按总编辑任务与研究君事实完成可编辑初稿。',
  '审查君': '你是审查君。逐项核验成稿中的事实是否来自研究君或用户输入；删除无法证实的数字、日期、来源、绝对化判断、收益承诺和交易指令；检查题目、正文、风险提示和资料来源格式。宁可使用“待核验”也不补造信息。',
};
const clean = (value, max = MAX_INPUT_LENGTH) => String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
function json(content, fallback = {}) { const value = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); const start = value.indexOf('{'), end = value.lastIndexOf('}'); if (start >= 0 && end > start) try { return JSON.parse(value.slice(start, end + 1)); } catch (_) {} return fallback; }
function cleanSourceRefs(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((row) => {
    const url = clean(row?.url, 2048);
    try { const parsed = new URL(url); if (!/^https?:$/.test(parsed.protocol)) return null; } catch (_) { return null; }
    const title = clean(row?.title, 240) || clean(row?.name, 120) || '原始资料';
    const name = clean(row?.name, 120) || '公开资料';
    const key = url.replace(/#.*$/, '');
    if (seen.has(key)) return null;
    seen.add(key);
    return { title, name, url: key, publishedAt: clean(row?.publishedAt, 80) };
  }).filter(Boolean).slice(0, 5);
}
function cleanCaseExamples(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    title: clean(row?.title, 180),
    contentType: clean(row?.type || row?.contentType, 60),
    subtype: clean(row?.subtype, 100),
    content: clean(row?.content, 1800),
  })).filter((row) => row.title || row.content).slice(0, 6);
}
function hasEmoji(value) { return /\p{Extended_Pictographic}/u.test(String(value || '')); }
function ensurePrivateMarketingEmoji(value) {
  const body = clean(value, 3000);
  if (!body) return body;
  return hasEmoji(body) ? body : `📌 ${body}\n\n✨ 关注后续公开信息与风险变化。`;
}
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
function productionPrompt({ topic, instruction, contentType, subtype, candidateMode, plan, profile, caseExamples }) {
  const format = candidateMode ? '{"candidates":[{"title":"候选标题","body":"候选正文"},{"title":"候选标题","body":"候选正文"},{"title":"候选标题","body":"候选正文"}]}' : '{"title":"内容标题","body":"可直接编辑的完整正文","sources":["用户明确提供的来源名称"]}';
  const privateRule = contentType === '私域营销文案' ? '私域营销文案必须使用 2—4 个与语义相关的 Emoji（如📌、💥、🔎、👇），首段要有阅读钩子；按“事实—影响/看点—下一步关注”写成 1—3 个短段，口语化但不夸张；不得使用“必涨、稳赚、上车、财富密码”等词，也不得把 Emoji 堆成装饰。' : '';
  return `${AGENT_SOULS['内容君']}\n\n请为期市内容引擎撰写中文期货市场内容。仅输出 JSON：${format}\n内容类型：${contentType}\n具体场景：${subtype || '未指定'}\n选题：${topic || '未指定'}\n生成指令：${instruction || '围绕选题生成专业、克制、可供人工编辑的内容。'}\n研究规划：${plan}\n用户已确认的表达偏好：${profile || '暂无，按专业、克制、清晰执行。'}\n案例库样本（只学习风格，不可复用其中事实）：${JSON.stringify(caseExamples || [])}\n硬性要求：只能基于输入事实；缺少事实时使用待核验表述，绝不杜撰数据、日期、来源或机构观点；不提供买卖指令或收益承诺；正文为纯文本；资料来源仅填写用户明确提供的名称；${privateRule}${contentType === 'Push' ? '每条正文35—55个汉字并以“投资有风险，入市需谨慎”收尾。' : '不在正文重复风险提示，系统将统一追加。'}`;
}
function cleanResult(value, topic, candidateMode, contentType, sourceRefs) { if (candidateMode) { const candidates = (value.candidates || []).map(x => ({ title: clean(x?.title, 160), body: contentType === '私域营销文案' ? ensurePrivateMarketingEmoji(x?.body) : clean(x?.body, 3000) })).filter(x => x.body).slice(0, 3); if (!candidates.length) throw Error('MODEL_INVALID_RESPONSE'); return { candidates, sources: sourceRefs }; } const body = clean(value.body, 12000); if (!body) throw Error('MODEL_INVALID_RESPONSE'); return { title: clean(value.title, 200) || topic || '期市内容初稿', body, sources: sourceRefs }; }
async function runAgents(input, provider) {
  const context = JSON.stringify({ topic: input.topic, instruction: input.instruction, contentType: input.contentType, subtype: input.subtype, learningProfile: input.learningProfile || '', sourceRefs: input.sourceRefs.map(({ title, name, url }) => ({ title, name, url })), caseExamples: input.caseExamples });
  const candidateMode = ['Push', '私域营销文案'].includes(input.contentType);
  const research = await ask(provider, AGENT_SOULS['研究君'], `${context}\n只输出 {"facts":[],"researchAnalysis":[],"gaps":[],"boundaries":[]}`, candidateMode ? 1200 : 2400);
  const plan = await ask(provider, AGENT_SOULS['总编辑'], `${context}\n研究结果：${research.content}\n只输出 {"outline":[],"audience":"","tone":"","checks":[]}`, 700);
  const writer = await ask(provider, AGENT_SOULS['内容君'], productionPrompt({ ...input, candidateMode, plan: plan.content, profile: input.learningProfile, caseExamples: input.caseExamples }), candidateMode ? 1300 : 2800);
  const reviewer = await ask(provider, AGENT_SOULS['审查君'], `用户输入：${context}\n研究结果：${research.content}\n总编辑任务：${plan.content}\n写作初稿：${writer.content}\n只输出与写作初稿完全同构的 JSON。`, candidateMode ? 1300 : 2800);
  return { result: cleanResult(json(reviewer.content, json(writer.content, {})), input.topic, candidateMode, input.contentType, input.sourceRefs), agentRun: Object.keys(AGENT_SOULS).map((name) => ({ name, status: 'completed', soul: AGENT_SOULS[name] })), model: writer.model };
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    await currentProfile(req);
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}), provider = clean(raw.model, 40) || 'MiniMax';
    if (!ENDPOINTS[provider]) return send(res, 400, { error: 'UNSUPPORTED_MODEL' });
    const input = { topic: clean(raw.topic, 1000), instruction: clean(raw.instruction), contentType: clean(raw.contentType, 80) || '营销页面文案', subtype: clean(raw.subtype, 120), learningProfile: clean(raw.learningProfile, 1800), sourceRefs: cleanSourceRefs(raw.sourceRefs), caseExamples: cleanCaseExamples(raw.caseExamples) };
    if (!input.topic && !input.instruction) return send(res, 400, { error: 'GENERATION_INPUT_REQUIRED' });
    const output = await runAgents(input, provider);
    return send(res, 200, { ...output.result, model: output.model, provider, agentRun: output.agentRun });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    if (error.message === 'READ_ONLY_ACCOUNT') return send(res, 403, { error: 'READ_ONLY_ACCOUNT' });
    if (error.message === 'PROFILE_NOT_FOUND') return send(res, 403, { error: 'PROFILE_NOT_FOUND' });
    if (error instanceof SyntaxError) return send(res, 400, { error: 'INVALID_REQUEST_BODY' });
    if (error.name === 'AbortError') return send(res, 504, { error: 'AI_GENERATION_TIMEOUT' });
    if (/_NOT_CONFIGURED$/.test(error.message || '')) return send(res, 503, { error: error.message });
    if (/^(MINIMAX|DEEPSEEK|MODEL)_/.test(error.message)) return send(res, 502, { error: error.message });
    console.error('AI generation unavailable', error); return send(res, 500, { error: 'AI_GENERATION_UNAVAILABLE' });
  }
};
module.exports._test = { clean, json, cleanSourceRefs, cleanCaseExamples, ensurePrivateMarketingEmoji, cleanResult, productionPrompt, AGENT_SOULS };
