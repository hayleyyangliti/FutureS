const { currentProfile, send, supabase } = require('../_supabase');

const ENDPOINTS = { MiniMax: 'https://api.minimaxi.com/v1/text/chatcompletion_v2', DeepSeek: 'https://api.deepseek.com/chat/completions' };
const MAX_INPUT_LENGTH = 8000;
// Souls are the durable work contracts for the production chain.  They are
// deliberately server-side: the browser can describe a task, but cannot
// change what an Agent is allowed to infer or publish.
const AGENT_SOULS = {
  '研究君': `你是研究君，是期货研究与证据核验的第一责任人。
任务范围：只基于用户提供的材料、可追溯公开来源、研报摘要与明确的来源链接工作；提取事件主体、发生时间、事实表述、数量/价格/比例、影响品种及信息有效期。
分析框架：依次判断供给、需求、库存、物流、成本、宏观、政策、汇率、地缘风险与市场预期的传导路径；指出直接影响、可能的二阶影响与尚无证据支持的推断。
输出要求：分开输出“已核验事实、研究分析、待补资料、风险边界”；每项分析必须能回溯到输入事实，不确定内容标注“待核验”。
禁止事项：不得虚构研报观点、机构结论、数据、日期、来源或行情；不得给出买卖指令、收益承诺或确定性价格判断。`,
  '总编辑': `你是总编辑，是生产链路的任务编排与质量责任人。
任务范围：接收选题、内容类型、受众、发布场景、来源与研究结果；明确内容要解决的核心问题，决定是否适合生产以及应采用的表达角度。
编排规则：根据内容形式输出目标读者、标题方向、信息优先级、文章/短文结构、建议篇幅、语气、行动引导与逐项核验清单；研究证据不足时要求收缩表达或使用待核验表述。
协作规则：只向内容君交付有事实边界的任务；要求内容君读取匹配案例的品牌风格，但不得借用案例中的事实或过时结论；将审查君作为发布前的必经环节。
禁止事项：不得自行补写研究信息、数字、来源或交易建议；不得以营销需要突破事实边界、合规要求或风险提示规则。`,
  '内容君': `你是内容君，是品牌化内容表达与可编辑初稿的第一责任人。
输入使用：必须先读取总编辑任务、研究君事实边界和同内容类型/场景的案例库样本；样本只能用于学习标题长度、段落节奏、术语密度、品牌语气、排版习惯和风险提示位置。
写作规则：围绕一个核心结论组织“事实—影响/解读—后续关注”；不同内容形式严格匹配字数、结构和语气要求；私域营销文案使用克制且相关的 Emoji，Push 保持短、清楚、单一重点。
质量标准：所有事实、数字、日期、来源和机构观点必须来自研究输入；语言专业、清晰、可供人工编辑；无来源的判断必须降级为条件性或待核验表述。
禁止事项：不得复制案例事实、数据、观点或过时结论；不得制造标题党、收益承诺、交易指令、绝对化行情判断或虚构来源。`,
  '审查君': `你是审查君，是发布前事实、合规、来源与风险提示的最后责任人。
核验范围：逐句将初稿与研究结果、原始输入和来源列表比对；重点检查主体、时间、数字、因果关系、品种映射、机构名称、资料来源、标题承诺与风险提示。
处置规则：删除或改写无法支撑的表述；将不确定内容改为“待核验”或条件性描述；保留符合证据边界的内容结构；确认资料来源只包含可跳转、可追溯的原文链接。
合规红线：禁止收益承诺、确定性涨跌、直接交易指令、夸大宣传、伪造来源与遗漏必要风险提示；期货内容须避免让读者误解为投资建议。
输出标准：返回与初稿同构、可直接编辑的成稿；如无合格证据，不以补造内容替代核验。`,
};
const SOUL_NAMES = Object.keys(AGENT_SOULS);
async function activeSouls() {
  // Global Soul settings are stored server-side.  A missing configuration is
  // intentionally harmless: production falls back to the reviewed defaults.
  try {
    const rows = await supabase('/rest/v1/prompt_overrides?owner_id=is.null&prompt_key=like.agent_soul%3A%25&select=prompt_key,content');
    return (Array.isArray(rows) ? rows : []).reduce((souls, row) => {
      const name = String(row.prompt_key || '').replace(/^agent_soul:/, '');
      const content = clean(row.content, 12000);
      if (SOUL_NAMES.includes(name) && content) souls[name] = content;
      return souls;
    }, { ...AGENT_SOULS });
  } catch (_) { return { ...AGENT_SOULS }; }
}
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
function privateCopyBody(value) {
  return String(value || '')
    .replace(/(?:^|\n)\s*(?:资料来源|信息来源|来源|参考资料)\s*[：:][\s\S]*$/g, '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s<>]+/g, '')
    .replace(/据[^，。；\n]{1,70}(?:报道|消息|数据)[，,]?/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}
function hasEmoji(value) { return /\p{Extended_Pictographic}/u.test(String(value || '')); }
function ensurePrivateMarketingEmoji(value) {
  const body = clean(privateCopyBody(value), 3000);
  if (!body) return body;
  return hasEmoji(body) ? body : `📌 ${body}\n\n✨ 关注后续公开信息与风险变化。`;
}
function settings(provider) { const deep = provider === 'DeepSeek', key = clean(process.env[deep ? 'DEEPSEEK_API_KEY' : 'MINIMAX_API_KEY'], 1000); if (!key) throw Error(deep ? 'DEEPSEEK_NOT_CONFIGURED' : 'MINIMAX_NOT_CONFIGURED'); return { deep, key, model: deep ? (process.env.DEEPSEEK_MODEL || 'deepseek-flash') : (process.env.MINIMAX_MODEL || 'MiniMax-M2.7') }; }
async function ask(provider, system, user, maxTokens = 900) {
  const config = settings(provider), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(ENDPOINTS[provider], { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model, stream: false, temperature: .35, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(config.deep ? { max_tokens: maxTokens, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } } : { max_completion_tokens: maxTokens }) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.base_resp?.status_code) {
      // Return actionable codes without leaking provider responses or secrets.
      const prefix=config.deep?'DEEPSEEK':'MINIMAX';
      const reason=({400:'INVALID_PARAMETERS',401:'INVALID_API_KEY',402:'INSUFFICIENT_BALANCE',403:'ACCESS_DENIED',404:'MODEL_NOT_AVAILABLE',422:'INVALID_PARAMETERS',429:'RATE_LIMITED',500:'PROVIDER_UNAVAILABLE',503:'PROVIDER_UNAVAILABLE'})[response.status]||'REQUEST_FAILED';
      console.warn('AI provider request failed',{provider,status:response.status,model:config.model});
      throw Error(prefix+'_'+reason);
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw Error(config.deep ? 'DEEPSEEK_EMPTY_RESPONSE' : 'MINIMAX_EMPTY_RESPONSE');
    return { content, model: config.model };
  } finally { clearTimeout(timer); }
}
function productionPrompt({ topic, instruction, contentType, subtype, candidateMode, plan, profile, caseExamples, souls }) {
  const format = candidateMode ? '{"candidates":[{"title":"候选标题","body":"候选正文"},{"title":"候选标题","body":"候选正文"},{"title":"候选标题","body":"候选正文"}]}' : '{"title":"内容标题","body":"可直接编辑的完整正文","sources":["用户明确提供的来源名称"]}';
  const privateRule = contentType === '私域营销文案' ? '私域文案必须以匹配的历史案例为首要表达标准：先提炼案例的字数范围、分段、句长、开头钩子、Emoji位置与密度、结尾引导，再按这些特征写作；禁止把新闻摘要或研究长文换上Emoji充当营销文案。相同场景案例优先，缺少同场景时学习同类型案例。3条候选使用不同开头和角度，避免同义改写。案例未提供完整正文时采用80—160字、2—4短段、2—4个相关Emoji的简短私域表达，不虚称已学习案例。正文严禁出现媒体名称、据某媒体报道、来源段落、网址、Markdown链接或引用编号；可追溯来源由系统在独立资料来源区域展示。风险提示由系统追加。' : '';
  return `${souls['内容君']}\n\n请为期市内容引擎撰写中文期货市场内容。仅输出 JSON：${format}\n内容类型：${contentType}\n具体场景：${subtype || '未指定'}\n选题：${topic || '未指定'}\n生成指令：${instruction || '围绕选题生成专业、克制、可供人工编辑的内容。'}\n研究规划：${plan}\n用户已确认的表达偏好：${profile || '暂无，按专业、克制、清晰执行。'}\n案例库样本（只学习风格，不可复用其中事实）：${JSON.stringify(caseExamples || [])}\n硬性要求：只能基于输入事实；缺少事实时使用待核验表述，绝不杜撰数据、日期、来源或机构观点；不提供买卖指令或收益承诺；正文为纯文本；资料来源仅填写用户明确提供的名称；${privateRule}${contentType === 'Push' ? '每条正文35—55个汉字并以“投资有风险，入市需谨慎”收尾。' : '不在正文重复风险提示，系统将统一追加。'}`;
}
function cleanResult(value, topic, candidateMode, contentType, sourceRefs) { if (candidateMode) { const candidates = (value.candidates || []).map(x => ({ title: clean(x?.title, 160), body: contentType === '私域营销文案' ? ensurePrivateMarketingEmoji(x?.body) : clean(x?.body, 3000) })).filter(x => x.body).slice(0, 3); if (!candidates.length) throw Error('MODEL_INVALID_RESPONSE'); return { candidates, sources: sourceRefs }; } const body = clean(value.body, 12000); if (!body) throw Error('MODEL_INVALID_RESPONSE'); return { title: clean(value.title, 200) || topic || '期市内容初稿', body, sources: sourceRefs }; }
async function runAgents(input, provider) {
  const souls = await activeSouls();
  const context = JSON.stringify({ topic: input.topic, instruction: input.instruction, contentType: input.contentType, subtype: input.subtype, learningProfile: input.learningProfile || '', sourceRefs: input.sourceRefs.map(({ title, name, url }) => ({ title, name, url })), caseExamples: input.caseExamples });
  const candidateMode = ['Push', '私域营销文案'].includes(input.contentType);
  const research = await ask(provider, souls['研究君'], `${context}\n只输出 {"facts":[],"researchAnalysis":[],"gaps":[],"boundaries":[]}`, candidateMode ? 1200 : 2400);
  const plan = await ask(provider, souls['总编辑'], `${context}\n研究结果：${research.content}\n只输出 {"outline":[],"audience":"","tone":"","checks":[]}`, 700);
  const writer = await ask(provider, souls['内容君'], productionPrompt({ ...input, candidateMode, plan: plan.content, profile: input.learningProfile, caseExamples: input.caseExamples, souls }), candidateMode ? 1300 : 2800);
  const reviewer = await ask(provider, souls['审查君'], `用户输入：${context}\n研究结果：${research.content}\n总编辑任务：${plan.content}\n写作初稿：${writer.content}\n${input.contentType === '私域营销文案' ? '必须对照案例保留其篇幅、分段、Emoji及品牌语气；删除正文中的媒体归因、来源、网址与链接。不要把营销短文扩写为研究文章。' : ''}\n只输出与写作初稿完全同构的 JSON。`, candidateMode ? 1300 : 2800);
  return { result: cleanResult(json(reviewer.content, json(writer.content, {})), input.topic, candidateMode, input.contentType, input.sourceRefs), agentRun: SOUL_NAMES.map((name) => ({ name, status: 'completed' })), model: writer.model };
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
