const { currentProfile, send } = require('../_supabase');

const MINIMAX_ENDPOINT = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MAX_INPUT_LENGTH = 8000;

function cleanText(value, maxLength = MAX_INPUT_LENGTH) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function parseModelJson(content, fallbackTitle) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const value = JSON.parse(text.slice(start, end + 1));
      if (value && typeof value === 'object') return value;
    } catch (_) {}
  }
  return { title: fallbackTitle, body: text };
}

function buildPrompt({ topic, instruction, contentType, subtype, candidateMode }) {
  const format = candidateMode
    ? `只输出 JSON，不要 Markdown，不要解释：
{"candidates":[{"title":"候选标题1","body":"候选正文1"},{"title":"候选标题2","body":"候选正文2"},{"title":"候选标题3","body":"候选正文3"}]}`
    : `只输出 JSON，不要 Markdown、HTML 标签或解释：
{"title":"内容标题","body":"可直接编辑的完整正文","sources":["用户已提供的来源名称"]}`;

  return `请为“期市内容引擎”生成中文期货市场内容。\n\n内容类型：${contentType}\n具体场景：${subtype || '未指定'}\n选题：${topic || '未指定，请根据生成指令拟定'}\n生成指令：${instruction || '请围绕选题生成专业、克制、可供人工编辑的内容。'}\n\n硬性要求：\n1. 只能基于用户提供的信息写作；没有事实或数据支撑时，使用条件性、待核验表述，绝不杜撰新闻、数据、机构观点、日期或来源。\n2. 不提供买卖指令、收益承诺或确定性价格预测；涉及市场判断时明确不确定性。\n3. 正文必须是纯文本，不得输出 <p>、<h2>、<ul>、** 或 # 等 HTML/Markdown 标记；用自然段和中文小标题组织内容。\n4. 资料来源只能填写用户明确提供的来源名称；没有明确来源时返回空数组，绝不杜撰来源、链接或日期。\n5. ${contentType === 'Push' ? '每条正文控制在 35—55 个汉字左右，并以“投资有风险，入市需谨慎”收尾。' : '不要在正文中再写风险提示；系统会按内容类型统一追加固定风险提示。'}\n\n${format}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    await currentProfile(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const provider = cleanText(body.model, 40) || 'MiniMax';
    if (!['MiniMax', 'DeepSeek'].includes(provider)) return send(res, 400, { error: 'UNSUPPORTED_MODEL' });
    const isDeepSeek = provider === 'DeepSeek';
    const apiKey = cleanText(isDeepSeek ? process.env.DEEPSEEK_API_KEY : process.env.MINIMAX_API_KEY, 1000);
    if (!apiKey) return send(res, 503, { error: isDeepSeek ? 'DEEPSEEK_NOT_CONFIGURED' : 'MINIMAX_NOT_CONFIGURED' });
    const model = isDeepSeek ? (process.env.DEEPSEEK_MODEL || 'deepseek-flash') : (process.env.MINIMAX_MODEL || 'MiniMax-M2.7');
    const topic = cleanText(body.topic, 1000);
    const instruction = cleanText(body.instruction);
    const contentType = cleanText(body.contentType, 80) || '营销页面文案';
    const subtype = cleanText(body.subtype, 120);
    const candidateMode = ['Push', '私域营销文案'].includes(contentType);
    if (!topic && !instruction) return send(res, 400, { error: 'GENERATION_INPUT_REQUIRED' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);
    let response;
    try {
      response = await fetch(isDeepSeek ? DEEPSEEK_ENDPOINT : MINIMAX_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是严谨的中文期货内容编辑助手。输出必须遵守用户给出的 JSON 格式。' },
            { role: 'user', content: buildPrompt({ topic, instruction, contentType, subtype, candidateMode }) },
          ],
          stream: false,
          temperature: 0.7,
          ...(isDeepSeek
            ? { max_tokens: candidateMode ? 1200 : 2400, response_format: { type: 'json_object' } }
            : { max_completion_tokens: candidateMode ? 1200 : 2400 }),
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`${provider} generation failed`, {
        status: response.status,
        code: payload?.base_resp?.status_code || payload?.code || null,
        message: payload?.base_resp?.status_msg || payload?.message || payload?.msg || null,
        requestId: payload?.id || payload?.request_id || null,
      });
      return send(res, 502, { error: isDeepSeek ? 'DEEPSEEK_REQUEST_FAILED' : 'MINIMAX_REQUEST_FAILED' });
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`${provider} returned no content`, { requestId: payload?.id || payload?.request_id || null });
      return send(res, 502, { error: isDeepSeek ? 'DEEPSEEK_EMPTY_RESPONSE' : 'MINIMAX_EMPTY_RESPONSE' });
    }

    const result = parseModelJson(content, topic || '期市内容初稿');
    if (candidateMode) {
      const candidates = Array.isArray(result.candidates) ? result.candidates : [];
      const safeCandidates = candidates
        .map((item) => ({ title: cleanText(item?.title, 160), body: cleanText(item?.body, 3000) }))
        .filter((item) => item.body)
        .slice(0, 3);
      if (!safeCandidates.length) return send(res, 502, { error: isDeepSeek ? 'DEEPSEEK_INVALID_RESPONSE' : 'MINIMAX_INVALID_RESPONSE' });
      return send(res, 200, { candidates: safeCandidates, model, provider });
    }

    const generated = {
      title: cleanText(result.title, 200) || topic || '期市内容初稿',
      body: cleanText(result.body, 12000),
      sources: Array.isArray(result.sources) ? result.sources.map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 5) : [],
    };
    if (!generated.body) return send(res, 502, { error: isDeepSeek ? 'DEEPSEEK_INVALID_RESPONSE' : 'MINIMAX_INVALID_RESPONSE' });
    return send(res, 200, { ...generated, model, provider });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    if (error.message === 'PROFILE_NOT_FOUND') return send(res, 403, { error: 'PROFILE_NOT_FOUND' });
    if (error instanceof SyntaxError) return send(res, 400, { error: 'INVALID_REQUEST_BODY' });
    if (error.name === 'AbortError') return send(res, 504, { error: 'AI_GENERATION_TIMEOUT' });
    console.error('AI generation unavailable', error);
    return send(res, 500, { error: 'AI_GENERATION_UNAVAILABLE' });
  }
};
