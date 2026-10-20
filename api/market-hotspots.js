const { currentProfile, send, supabase } = require('./_supabase');
const { scoreHotspots } = require('./_hotspot-scoring');

// Reuse existing server-only model credentials. Scoring never changes source facts.

// Explicitly configured sources are preferred. The fallback keeps existing deployments working.
const DEFAULT_SOURCES = [{
  spider: 'eastmoney_fast_news',
  params: { page_size: 20, fast_column: '113' },
  grade: 'B类·已核验',
  label: '东方财富期货快讯',
}];
const MAX_SOURCES = 19;
const MAX_ITEMS_PER_SOURCE = 30;
const MIN_ARTICLE_CHARS = 130;
const CATEGORY_RULES = [
  ['农产品', /豆[粕油]|玉米|小麦|棉花|白糖|生猪|鸡蛋|苹果|红枣|油脂|粮食|农产/],
  ['有色及贵金属', /黄金|白银|有色金属|贵金属|沪[铜铝锌镍锡铅]|[铜铝锌镍锡铅](?:价|矿|锭|库存|现货|冶炼|期货|供应|供给|需求|产量)/],
  ['黑色', /螺纹|热卷|铁矿|焦煤|焦炭|钢材|钢铁|煤炭|蒙煤|甘其毛都|策克口岸|满都拉口岸/],
  ['能源化工', /原油|油价|燃料油|沥青|天然气|化工|甲醇|PTA|乙二醇|塑料|橡胶|尿素|伊朗.{0,18}(?:制裁|能源|冲突|袭击)|苏伊士运河|霍尔木兹|红海航运/],
  ['绿色金融及新能源', /新能源|光伏|锂|碳交易|碳排放|风电|储能/],
  ['金融工程', /期权|波动率|量化|指数|套利/],
  ['资产配置', /国债|股债|资产配置|风险偏好|美元|汇率/],
  ['宏观', /央行|利率|通胀|CPI|PPI|GDP|非农|货币政策|财政|就业|宏观|经济数据/],
];
// Single metal characters match people's names (e.g. 尹锡悦), so require market context.
const FUTURES_TERMS = /期货|期权|大宗商品|商品(?:价格|期货|市场)|原油|油价|石油|天然气|黄金|白银|有色金属|贵金属|沪[铜铝锌镍锡铅]|[铜铝锌镍锡铅](?:价|矿|锭|库存|现货|冶炼|期货|供应|供给|需求|产量)|铁矿|螺纹|钢材|焦煤|焦炭|豆[粕油]|玉米|小麦|棉花|白糖|生猪|鸡蛋|甲醇|PTA|橡胶|国债|股指|油脂|碳酸锂|碳交易|碳排放/;
const SUPPLY_CHAIN_TERMS = /甘其毛都|策克口岸|满都拉口岸|蒙煤|蒙古煤|蒙古(?:国)?煤炭|煤炭通关|口岸通关|伊朗.{0,18}(?:原油|石油|制裁|能源|冲突|袭击)|(?:制裁|袭击|封锁).{0,12}伊朗|苏伊士(?:运河)?|霍尔木兹(?:海峡)?|红海航运|海运(?:费|运力|航线)|油轮(?:运输|运费)|航道(?:中断|受阻|恢复)|港口(?:库存|通关|装运)|铁路(?:运量|运输煤炭)|大宗商品供应链/;
const IMPORTANT_TERMS = /央行|美联储|监管|货币政策|财政政策|利率|通胀|CPI|PPI|GDP|非农|关税|减产|增产|库存|交易所|数据公布/;
const MACRO_HEADLINE_TERMS = /央行|美联储|利率|通胀|CPI|PPI|GDP|非农|美元|汇率|关税|欧佩克|OPEC|经济数据|财政政策|债券市场|收益率/;
const GENERIC_HEADLINE = /^(期货|商品|市场|财经)(热点|快讯|资讯|新闻)(追踪|汇总|速览)?$/;
const MARKET_TAPE_CONTEXT = /期货|期权|期市|合约|主力|燃油|燃料油|油价|原油|布油|美油|黄金|白银|贵金属|有色金属|黑色系|农产品板块|能源化工板块|沪[铜铝锌镍锡铅]|铁矿|螺纹|焦煤|焦炭|豆粕|豆油|玉米|生猪|国债|美债|股指|期指|商品指数/;
const MARKET_TAPE_ACTION = /开盘|收盘|收涨|收跌|高开|低开|平开|盘中|早盘|午盘|夜盘|尾盘|涨超|跌超|涨约|跌约|涨逾|跌逾|涨幅|跌幅|涨停|跌停|上涨|下跌|拉升|跳水|走高|走低|升破|跌破|[涨跌]\s*\d|报(?:\d|[一二三四五六七八九十])/;
const SOURCE_ORIGINS = {
  yicai_quick_news: 'https://www.yicai.com', sina_finance_news: 'https://finance.sina.com.cn',
  hexun_global_news: 'https://news.hexun.com', futunn_flash_news: 'https://news.futunn.com',
  wallstreetcn_global_news: 'https://wallstreetcn.com', jin10_flash_news: 'https://flash.jin10.com',
  fortune_flash_news: 'https://fortune.com', marketwatch_flash_news: 'https://www.marketwatch.com',
  '21jingji_quick_news': 'https://www.21jingji.com', ths_10jqka_global_news: 'https://news.10jqka.com.cn',
  jrj_news_flash: 'https://24h.jrj.com.cn', eastmoney_fast_news: 'https://finance.eastmoney.com',
  cls_global_news: 'https://www.cls.cn', xueqiu_flash_news: 'https://xueqiu.com',
  xuangubao_flash_news: 'https://www.xuangubao.cn', jiemian_flash_news: 'https://www.jiemian.com',
  gelonghui_flash_news: 'https://www.gelonghui.com', investing_news: 'https://cn.investing.com',
  forbes_flash_news: 'https://www.forbes.com',
};

function parseSources() {
  const raw = (process.env.OMNIDATA_HOTSPOT_SOURCES || '').trim();
  if (!raw) return { sources: DEFAULT_SOURCES, configured: false };
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('must be an array');
    const sources = value.filter((item) => item && typeof item.spider === 'string' && item.spider.trim()).map((item) => ({
      spider: item.spider.trim(),
      params: item.params && typeof item.params === 'object' ? item.params : {},
      grade: item.grade === 'A类信源' ? 'A类信源' : 'B类·已核验',
      label: typeof item.label === 'string' ? item.label.trim() : '',
    })).slice(0, MAX_SOURCES);
    if (!sources.length) throw new Error('empty array');
    return { sources, configured: true };
  } catch (error) {
    console.error('Invalid OMNIDATA_HOTSPOT_SOURCES', error.message);
    return { sources: DEFAULT_SOURCES, configured: false, configError: true };
  }
}

function allArrays(value, arrays = [], depth = 0) {
  if (depth > 3 || value == null) return arrays;
  if (Array.isArray(value)) { arrays.push(value); return arrays; }
  if (typeof value === 'object') ['data', 'items', 'list', 'news', 'results', 'records'].forEach((key) => allArrays(value[key], arrays, depth + 1));
  return arrays;
}
function pickItems(payload) { return allArrays(payload).sort((a, b) => b.length - a.length)[0] || []; }
function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function articleCharacterCount(item) {
  // Some spiders put the full article in title; count the longest raw field,
  // never title + excerpt combined (which would inflate short flashes).
  const fields = [item?.content, item?.summary, item?.digest, item?.description,
    item?.body, item?.article_text, item?.text, item?.title, item?.news_title, item?.newsTitle];
  return Math.max(0, ...fields.map((value) =>
    (text(value).replace(/<[^>]*>/g, ' ').match(/[\p{L}\p{N}]/gu) || []).length));
}
function qualifiesArticleLength(item) { return articleCharacterCount(item) >= MIN_ARTICLE_CHARS; }
function normalizeDate(value) {
  const raw = text(value); if (!raw) return '';
  const cleaned = raw.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-');
  const local = cleaned.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
  // OmniData's pub_time values are usually China-local timestamps without an
  // offset. Vercel runs in UTC, so make the intended zone explicit.
  const date = new Date(local ? `${local[1]}T${local[2]}+08:00` : cleaned);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}
function classify(value) { return (CATEGORY_RULES.find(([, rule]) => rule.test(value)) || ['宏观'])[0]; }
function contractsFor(value) {
  const names = ['黄金', '白银', '沪铜', '沪铝', '原油', '燃料油', '沥青', '螺纹钢', '铁矿石', '焦煤', '焦炭', '豆粕', '豆油', '玉米', '棉花', '白糖', '生猪', '甲醇', 'PTA', '橡胶', '碳酸锂', '国债', '股指'];
  const matched = names.filter((name) => value.includes(name.replace(/^沪/, '')));
  if (/甘其毛都|策克口岸|满都拉口岸|蒙煤|蒙古煤|煤炭通关/.test(value) && !matched.includes('焦煤')) matched.push('焦煤');
  if (/伊朗.{0,18}(?:原油|石油|制裁|能源|冲突|袭击)|(?:制裁|袭击|封锁).{0,12}伊朗|苏伊士(?:运河)?|霍尔木兹(?:海峡)?|红海航运|油轮运输/.test(value) && !matched.includes('原油')) matched.push('原油');
  return matched.slice(0, 4);
}
function isMarketTape(title) {
  const lead = text(title).split(/[，,。；;]/, 1)[0];
  return MARKET_TAPE_CONTEXT.test(lead) && MARKET_TAPE_ACTION.test(lead) &&
    !/(?:宣布|决定|公布|发布|批准|签署|出台|实施|减产|增产|出口|进口|库存|报告|数据)/.test(lead);
}
function articleUrl(item, source) {
  const candidates = [item?.url, item?.link, item?.news_url, item?.newsUrl, item?.article_url,
    item?.source_url, item?.sourceUrl, item?.href, item?.detailUrl, item?.pcInfoUrl,
    item?.infoUrl, item?.ShareUrl, item?.source_link, item?.uri, item?.entityurl];
  for (const value of candidates) {
    const raw = text(value).replace(/&amp;/g, '&');
    if (!raw) continue;
    const absolute = raw.startsWith('//') ? `https:${raw}` : /^www\./i.test(raw) ? `https://${raw}` : raw;
    const origin = SOURCE_ORIGINS[source.spider];
    if (!/^https?:\/\//i.test(absolute) && !absolute.startsWith('/') && !absolute.includes('/')) continue;
    if (!/^https?:\/\//i.test(absolute) && !origin) continue;
    try {
      const url = new URL(absolute, origin);
      if (/^https?:$/.test(url.protocol) && url.hostname.includes('.')) return url.href;
    } catch (_) { /* Try the next URL field. */ }
  }
  return '';
}
function conciseHeadline(value) {
  const raw = text(value);
  // Many spiders put a short editor headline in 【】 and append the article body.
  const bracketed = raw.match(/^【([^】]{6,70})】/);
  if (bracketed) return conciseHeadline(bracketed[1]);
  const firstSentence = raw.split(/[。！？!?\n]/, 1)[0].trim();
  if (firstSentence !== raw && Array.from(firstSentence).length >= 10 && Array.from(firstSentence).length <= 52) return firstSentence;
  if (Array.from(raw).length <= 52) return raw;
  if (Array.from(firstSentence).length <= 52) return firstSentence;
  const clauses = firstSentence.split(/[，,；;]/);
  if (Array.from(clauses[0]).length >= 12 && Array.from(clauses[0]).length <= 52) return clauses[0].trim();
  return `${Array.from(firstSentence).slice(0, 48).join('').trim()}…`;
}
function normalizeItem(item, source, index) {
  const originalTitle = text(item?.title || item?.news_title || item?.newsTitle || item?.name || item?.content).slice(0, 900);
  const title = conciseHeadline(originalTitle);
  const sourceSummary = text(item?.summary || item?.digest || item?.description || item?.content || item?.body || item?.article_text || item?.text);
  // Preserve the long original title as the expandable excerpt when it carries
  // more detail than the source's separate summary/content field.
  const summary = (originalTitle.length > 52 && originalTitle.length > sourceSummary.length ? originalTitle : sourceSummary || originalTitle).slice(0, 900);
  const supplyChain = SUPPLY_CHAIN_TERMS.test(`${title} ${summary}`);
  // A passing commodity reference in the body must not admit unrelated stories.
  if (!title || title.length < 6 || GENERIC_HEADLINE.test(title) || isMarketTape(title) || (!FUTURES_TERMS.test(title) && !MACRO_HEADLINE_TERMS.test(title) && !supplyChain)) return null;
  const relevanceText = supplyChain ? `${title} ${summary}` : title;
  return {
    id: `${source.spider}:${item?.id || item?.code || index}`, title, originalTitle, summary,
    sourceUrl: articleUrl(item, source),
    source: text(item?.source || item?.media || item?.publisher || item?.platform || source.label || source.spider),
    publishedAt: normalizeDate(item?.pub_time || item?.publish_time || item?.publishTime || item?.published_at || item?.publishedAt || item?.time || item?.datetime || item?.date),
    grade: source.grade, category: classify(relevanceText), contracts: contractsFor(relevanceText),
    scope: newsScope(title) === 'other' ? newsScope(summary) : newsScope(title), supplyChain,
  };
}
// \W is ASCII-only in JavaScript and silently discards Chinese titles.
function titleKey(value) { return text(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 120); }
function pairOverlap(a, b) {
  const pairs = (value) => { const chars = Array.from(value); return new Set(chars.slice(1).map((char, index) => chars[index] + char)); };
  const left = pairs(a), right = pairs(b);
  return [...left].filter((pair) => right.has(pair)).length / Math.max(left.size, right.size, 1);
}
function sameHotspot(left, right) {
  const a = titleKey(left), b = titleKey(right); if (!a || !b) return false;
  if (a === b) return true;
  // Require a substantial shared run: short generic titles must not merge.
  if (Math.min(a.length, b.length) >= 8 && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.5 && (a.includes(b) || b.includes(a))) return true;
  if (Math.min(a.length, b.length) < 14) return false;
  // Headlines from the same speech often share a long attribution before “：”,
  // then quote different points from that one event.
  const leadA = titleKey(text(left).split(/[：:]/, 1)[0]);
  const leadB = titleKey(text(right).split(/[：:]/, 1)[0]);
  if (Math.min(leadA.length, leadB.length) >= 14 && pairOverlap(leadA, leadB) >= 0.8) return true;
  return pairOverlap(a, b) >= 0.5;
}
function sameSpeakerLead(left, right) {
  const leadA = titleKey(text(left).split(/[：:]/, 1)[0]);
  const leadB = titleKey(text(right).split(/[：:]/, 1)[0]);
  const similar = pairOverlap(leadA, leadB) >= 0.8 ||
    (Math.min(leadA.length, leadB.length) >= 6 && (leadA.includes(leadB) || leadB.includes(leadA)));
  return Math.min(leadA.length, leadB.length) >= 6 && similar &&
    /(?:央行|行长|主席|部长|发言人|官员|代表)/.test(leadA) && /(?:央行|行长|主席|部长|发言人|官员|代表)/.test(leadB);
}
function sameEventWindow(left, right) {
  const a = Date.parse(left.publishedAt || ''), b = Date.parse(right.publishedAt || '');
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) <= 24 * 60 * 60 * 1000;
}
function sameSpeechWindow(left, right) {
  const a = Date.parse(left.publishedAt || ''), b = Date.parse(right.publishedAt || '');
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 2 * 60 * 60 * 1000;
}
function ageMinutes(value) { const date = new Date(value); return !value || Number.isNaN(date.getTime()) ? null : Math.max(0, (Date.now() - date.getTime()) / 60000); }
function evidenceKey(item) {
  return text(item.summary || item.originalTitle || item.title).replace(/^【[^】]*】/, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 700);
}
function sameEvidence(left, right) {
  const a = evidenceKey(left), b = evidenceKey(right);
  if (a === b) return true;
  // A headline-only copy cannot provide a second independent account.
  if (Math.min(a.length, b.length) < 30) return sameHotspot(left.title, right.title);
  const shorter = a.length < b.length ? a : b, longer = a.length < b.length ? b : a;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.75) return true;
  const pairs = (value) => { const chars = Array.from(value); return new Set(chars.slice(1).map((char, index) => chars[index] + char)); };
  const first = pairs(a), second = pairs(b);
  const shared = [...first].filter((pair) => second.has(pair)).length;
  return shared / Math.max(first.size, second.size) >= 0.78;
}
function score(primary, sources) {
  const count = new Set(sources.map((source) => source.name)).size, age = ageMinutes(primary.publishedAt);
  const relevanceText = `${primary.title} ${primary.summary || ''}`;
  const direct = FUTURES_TERMS.test(primary.title) || SUPPLY_CHAIN_TERMS.test(relevanceText), macro = MACRO_HEADLINE_TERMS.test(primary.title);
  const supplyEvent = SUPPLY_CHAIN_TERMS.test(relevanceText) && /通关|进口|出口|运输|停产|复产|封锁|制裁|冲突|袭击|中断|受阻|恢复|运量|库存/.test(relevanceText);
  const importance = Math.min(45, 14 + (IMPORTANT_TERMS.test(primary.title) || supplyEvent ? 12 : 0) + (direct ? 8 : macro ? 4 : 0) + (primary.grade === 'A类信源' ? 6 : 0) + Math.min(5, Math.max(0, count - 1) * 3));
  const timeliness = age == null ? 10 : age <= 15 ? 25 : age <= 60 ? 22 : age <= 240 ? 18 : age <= 720 ? 13 : age <= 1440 ? 9 : 5;
  // Only distinct content from a different publisher contributes corroboration;
  // long text and syndicated copies do not create information gain by themselves.
  const informationGain = Math.min(20, 7 + Math.min(13, Math.max(0, count - 1) * 5));
  const futuresRelevance = direct ? 10 : macro ? 6 : 0;
  return { importance, timeliness, informationGain, futuresRelevance, total: importance + timeliness + informationGain + futuresRelevance };
}
function clusterItems(items) {
  const clusters = [];
  for (const item of items) {
    let cluster = clusters.find((candidate) => candidate.items.some((entry) =>
      (sameHotspot(entry.title, item.title) && sameEventWindow(entry, item)) ||
      (sameSpeakerLead(entry.title, item.title) && sameSpeechWindow(entry, item)) ||
      (item.sourceUrl && entry.sourceUrl === item.sourceUrl)));
    if (!cluster) { cluster = { items: [] }; clusters.push(cluster); }
    cluster.items.push(item);
  }
  const ranked = clusters.map((cluster, index) => {
    const distinct = [];
    for (const item of [...cluster.items].sort((a, b) => Date.parse(a.publishedAt || 0) - Date.parse(b.publishedAt || 0))) {
      const duplicateIndex = distinct.findIndex((entry) =>
        (item.sourceUrl && entry.sourceUrl === item.sourceUrl) || sameEvidence(entry, item));
      if (duplicateIndex < 0) distinct.push(item);
      else if (!distinct[duplicateIndex].sourceUrl && item.sourceUrl) distinct[duplicateIndex] = item;
    }
    const sources = distinct.filter((item, position) => distinct.findIndex((entry) => entry.source === item.source) === position).map((item) => ({ name: item.source, url: item.sourceUrl, publishedAt: item.publishedAt, grade: item.grade, title: item.title, excerpt: item.summary.slice(0, 500) })).slice(0, 3);
    // Keep single-source events visible while still excluding repeated copies.
    if (!sources.length) return null;
    const primary = [...cluster.items].sort((a, b) => Number(b.summary !== b.title) - Number(a.summary !== a.title) || b.summary.length - a.summary.length || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))[0];
    const firstPublishedAt = cluster.items.map((item) => item.publishedAt).filter((value) => Number.isFinite(Date.parse(value))).sort()[0] || primary.publishedAt;
    const grade = sources.some((source) => source.grade === 'A类信源') ? 'A类信源' : 'B类·已核验';
    const scoring = score({ ...primary, publishedAt: firstPublishedAt, grade }, sources);
    return { id: `hotspot-${index + 1}`, title: primary.title, summary: primary.summary, summaryType: primary.summary === primary.title ? 'TITLE_ONLY' : 'SOURCE_EXCERPT', source: primary.source, sourceUrl: primary.sourceUrl, publishedAt: firstPublishedAt, grade, category: primary.category, contracts: primary.contracts, scope: primary.scope || 'other', sources, duplicateCount: cluster.items.length - distinct.length, scoring, score: scoring.total };
  }).filter(Boolean).sort((a, b) => b.score - a.score || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  return selectCoverage(ranked);
}
function newsScope(value) {
  if (/国内|我国|中国|人民币|国务院|发改委|海关总署|商务部|国家能源局|中国人民银行|央行逆回购|上期所|大商所|郑商所|中金所|甘其毛都|策克口岸|满都拉口岸|蒙煤|内蒙古|山西|山东|唐山|河北|青岛港|日照港/.test(value)) return 'domestic';
  if (/美国|美联储|美债|欧洲|欧盟|英国|日本|韩国|加拿大|澳大利亚|新西兰|巴西|阿根廷|俄罗斯|乌克兰|伊朗|中东|沙特|苏伊士|霍尔木兹|红海|OPEC|欧佩克|LME|芝加哥/.test(value)) return 'international';
  return 'other';
}
function selectCoverage(ranked, limit = 20) {
  // Reserve up to a quarter of the available slots for each scope. Fill only
  // from admitted reports, then keep the resulting list in score order.
  const size = Math.min(limit, ranked.length), quota = Math.max(1, Math.floor(size / 4));
  const reserved = new Set(['domestic', 'international'].flatMap((scope) =>
    ranked.filter((item) => item.scope === scope).slice(0, quota)));
  for (const item of ranked) {
    if (reserved.size >= size) break;
    reserved.add(item);
  }
  return ranked.filter((item) => reserved.has(item)).slice(0, size);
}
async function runSource(baseUrl, headers, source) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${baseUrl}/api/v1/spiders/run`, { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ spider_name: source.spider, params: source.params }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) return { source, ok: false, reason: payload?.message || payload?.detail || `HTTP ${response.status}` };
    return { source, ok: true, items: pickItems(payload).slice(0, MAX_ITEMS_PER_SOURCE) };
  } catch (error) { return { source, ok: false, reason: error.name === 'AbortError' ? '请求超时' : error.message }; }
  finally { clearTimeout(timeout); }
}
async function listRegisteredSpiders(baseUrl, headers) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/spiders`, { headers });
    const payload = await response.json().catch(() => null);
    const spiders = payload?.data?.spiders;
    return Array.isArray(spiders) ? spiders : null;
  } catch (error) {
    console.warn('Unable to read OmniData spider catalog', error.message);
    return null;
  }
}

const VERIFIED_LABELS = {
  yicai_quick_news: '第一财经', sina_finance_news: '新浪财经',
  hexun_global_news: '和讯', futunn_flash_news: '富途牛牛',
  wallstreetcn_global_news: '华尔街见闻', jin10_flash_news: '金十数据',
  fortune_flash_news: 'Fortune', marketwatch_flash_news: 'MarketWatch',
  '21jingji_quick_news': '21 财经', ths_10jqka_global_news: '同花顺',
  jrj_news_flash: '金融界', eastmoney_fast_news: '东方财富',
  cls_global_news: '财联社', xueqiu_flash_news: '雪球',
  xuangubao_flash_news: '选股宝', jiemian_flash_news: '界面新闻',
  gelonghui_flash_news: '格隆汇', investing_news: 'Investing.com',
  forbes_flash_news: '福布斯',
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    await currentProfile(req);
    // The ECS pushes its completed snapshot to Supabase. A browser refresh only
    // reads this saved copy; it never contacts the ECS or starts a spider.
    const snapshots = await supabase('/rest/v1/omnidata_news_snapshots?select=payload,updated_at&id=eq.current&limit=1');
    const feed = Array.isArray(snapshots) ? snapshots[0]?.payload?.data : null;
    if (!feed || !Array.isArray(feed.items)) return send(res, 503, { error: 'OMNIDATA_CACHE_EMPTY' });
    const admitted = feed.items.filter((entry) => entry && Object.hasOwn(VERIFIED_LABELS, entry.source));
    const longEnough = admitted.filter((entry) => qualifiesArticleLength(entry.item));
    const collected = longEnough.map((entry, index) => normalizeItem(
      entry.item,
      { spider: entry.source, label: VERIFIED_LABELS[entry.source] || entry.source, grade: 'B类·已核验' },
      index,
    )).filter(Boolean);
    const clustered = clusterItems(collected);
    let analysis = { items: clustered.map(item => ({ ...item, scoringMethod: 'RULE_PENDING' })), status: process.env.MINIMAX_API_KEY || process.env.DEEPSEEK_API_KEY ? 'PENDING' : 'MINIMAX_NOT_CONFIGURED' };
    if (req.query?.analysis === '1' || new URL(req.url || '/', 'http://localhost').searchParams.get('analysis') === '1') {
      analysis = await scoreHotspots(clustered);
    }
    const statuses = (Array.isArray(feed.sourceStatus) ? feed.sourceStatus : []).map((row) => ({
      spider: row.source, label: VERIFIED_LABELS[row.source] || row.source,
      ok: Boolean(row.lastSuccessAt) && !row.lastError,
      count: row.lastError ? 0 : row.lastCount || 0,
      checkedAt: row.lastAttemptAt,
      reason: row.lastError || undefined,
    }));
    const refreshedMs = Date.parse(feed.refreshedAt || '');
    const stale = !Number.isFinite(refreshedMs) || Date.now() - refreshedMs > 35 * 60 * 1000;
    const sameShanghaiDate = Number.isFinite(refreshedMs) &&
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(refreshedMs) ===
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
    return send(res, 200, {
      items: analysis.items, refreshedAt: feed.refreshedAt,
      stale, tradingDate: Boolean(feed.tradingDate && sameShanghaiDate),
      source: `服务器缓存：${Object.keys(VERIFIED_LABELS).length} 个准入信源，${statuses.filter((status) => status.ok).length} 个采集正常`,
      pipeline: {
        collected: collected.length, rejected: feed.items.length - collected.length, rejectedShort: admitted.length - longEnough.length,
        minArticleChars: MIN_ARTICLE_CHARS, clustered: clustered.length,
        domesticCandidates: collected.filter((item) => item.scope === 'domestic').length,
        internationalCandidates: collected.filter((item) => item.scope === 'international').length,
        supplyChainCandidates: collected.filter((item) => item.supplyChain).length,
        domesticDisplayed: analysis.items.filter((item) => item.scope === 'domestic').length,
        internationalDisplayed: analysis.items.filter((item) => item.scope === 'international').length,
        minSources: 1, maxSources: 3,
        sourcesRequested: Object.keys(VERIFIED_LABELS).length,
        sourcesSucceeded: statuses.filter((status) => status.ok).length,
        configured: true,
      },
      ai: { status: analysis.status, model: analysis.model || null, provider: analysis.provider || null },
      sourceStatus: statuses,
    });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    console.error('Market hotspot cache read failed', { name: error.name, code: error.code || null, status: error.status || null });
    if (error.code === 'PGRST205' || error.code === '42P01') return send(res, 503, { error: 'OMNIDATA_CACHE_TABLE_MISSING' });
    if (error.status === 401 || error.status === 403 || error.code === '42501') return send(res, 502, { error: 'OMNIDATA_CACHE_ACCESS_DENIED' });
    if (error.message?.startsWith('Missing environment variables:')) return send(res, 503, { error: 'OMNIDATA_SUPABASE_NOT_CONFIGURED' });
    return send(res, 502, { error: 'OMNIDATA_CACHE_UNAVAILABLE' });
  }
};

// Pure helpers are exposed for regression tests; this does not create an API route.
module.exports._test = { normalizeItem, titleKey, sameHotspot, sameSpeakerLead, isMarketTape, articleUrl, articleCharacterCount, qualifiesArticleLength, sameEvidence, clusterItems, score, newsScope, selectCoverage };
