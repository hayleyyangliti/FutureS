const { currentProfile, send } = require('./_supabase');

// Explicitly configured sources are preferred. The fallback keeps existing deployments working.
const DEFAULT_SOURCES = [{
  spider: 'eastmoney_fast_news',
  params: { page_size: 20, fast_column: '113' },
  grade: 'B类·已核验',
  label: '东方财富期货快讯',
}];
const MAX_SOURCES = 8;
const MAX_ITEMS_PER_SOURCE = 30;
const CATEGORY_RULES = [
  ['农产品', /豆[粕油]|玉米|小麦|棉花|白糖|生猪|鸡蛋|苹果|红枣|油脂|粮食|农产/],
  ['有色及贵金属', /黄金|白银|铜|铝|锌|镍|锡|铅|有色|贵金属|矿/],
  ['黑色', /螺纹|热卷|铁矿|焦煤|焦炭|钢材|钢铁|煤炭/],
  ['能源化工', /原油|油价|燃料油|沥青|天然气|化工|甲醇|PTA|乙二醇|塑料|橡胶|尿素/],
  ['绿色金融及新能源', /新能源|光伏|锂|碳交易|碳排放|风电|储能/],
  ['金融工程', /期权|波动率|量化|指数|套利/],
  ['资产配置', /国债|股债|资产配置|风险偏好|美元|汇率/],
  ['宏观', /央行|利率|通胀|CPI|PPI|GDP|非农|货币政策|财政|就业|宏观|经济数据/],
];
const FUTURES_TERMS = /期货|合约|商品|原油|黄金|白银|铜|铝|锌|镍|锡|铅|铁矿|螺纹|焦煤|焦炭|豆[粕油]|玉米|小麦|棉花|白糖|生猪|鸡蛋|甲醇|PTA|橡胶|国债|股指|期权|油脂|锂|碳/;
const IMPORTANT_TERMS = /央行|监管|政策|利率|通胀|CPI|PPI|GDP|非农|地缘|战争|制裁|关税|减产|增产|库存|供给|需求|数据公布|交易所|突发/;

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
function normalizeDate(value) {
  const raw = text(value); if (!raw) return '';
  const date = new Date(raw.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-'));
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}
function classify(value) { return (CATEGORY_RULES.find(([, rule]) => rule.test(value)) || ['宏观'])[0]; }
function contractsFor(value) {
  const names = ['黄金', '白银', '沪铜', '沪铝', '原油', '燃料油', '沥青', '螺纹钢', '铁矿石', '焦煤', '焦炭', '豆粕', '豆油', '玉米', '棉花', '白糖', '生猪', '甲醇', 'PTA', '橡胶', '碳酸锂', '国债', '股指'];
  return names.filter((name) => value.includes(name.replace(/^沪/, ''))).slice(0, 4);
}
function normalizeItem(item, source, index) {
  const title = text(item?.title || item?.news_title || item?.newsTitle || item?.name || item?.content).slice(0, 200);
  const summary = text(item?.summary || item?.digest || item?.description || item?.content || title).slice(0, 900);
  if (!title || title.length < 6) return null;
  const content = `${title} ${summary}`;
  return {
    id: `${source.spider}:${item?.id || item?.code || index}`, title, summary,
    sourceUrl: text(item?.url || item?.link || item?.news_url || item?.newsUrl || item?.href),
    source: text(item?.source || item?.media || item?.publisher || item?.platform || source.label || source.spider),
    publishedAt: normalizeDate(item?.publish_time || item?.publishTime || item?.published_at || item?.time || item?.datetime || item?.date),
    grade: source.grade, category: classify(content), contracts: contractsFor(content),
  };
}
function titleKey(value) { return text(value).toLowerCase().replace(/[\W_\d]/g, '').slice(0, 80); }
function sameHotspot(left, right) {
  const a = titleKey(left), b = titleKey(right); if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const chars = new Set(a), overlap = [...new Set(b)].filter((char) => chars.has(char)).length;
  return overlap / Math.max(new Set(a).size, new Set(b).size) >= 0.82;
}
function ageMinutes(value) { const date = new Date(value); return !value || Number.isNaN(date.getTime()) ? null : Math.max(0, (Date.now() - date.getTime()) / 60000); }
function score(primary, sources) {
  const body = `${primary.title} ${primary.summary}`, count = sources.length, age = ageMinutes(primary.publishedAt);
  const importance = Math.min(45, 16 + (IMPORTANT_TERMS.test(body) ? 14 : 0) + (primary.grade === 'A类信源' ? 8 : 0) + Math.min(7, count * 3));
  const timeliness = age == null ? 10 : age <= 15 ? 25 : age <= 60 ? 22 : age <= 240 ? 18 : age <= 720 ? 13 : age <= 1440 ? 9 : 5;
  const informationGain = Math.min(20, 8 + Math.min(8, count * 4) + (primary.summary.length > 120 ? 4 : 0));
  const futuresRelevance = Math.min(10, (FUTURES_TERMS.test(body) ? 7 : 2) + Math.min(3, primary.contracts.length));
  return { importance, timeliness, informationGain, futuresRelevance, total: importance + timeliness + informationGain + futuresRelevance };
}
function clusterItems(items) {
  const clusters = [];
  for (const item of items) {
    let cluster = clusters.find((candidate) => sameHotspot(candidate.items[0].title, item.title) || (item.sourceUrl && candidate.items.some((entry) => entry.sourceUrl === item.sourceUrl)));
    if (!cluster) { cluster = { items: [], sources: [] }; clusters.push(cluster); }
    cluster.items.push(item);
    if (!cluster.sources.some((source) => source.url === item.sourceUrl && source.name === item.source)) cluster.sources.push({ name: item.source, url: item.sourceUrl, publishedAt: item.publishedAt, grade: item.grade, title: item.title });
  }
  return clusters.map((cluster, index) => {
    const primary = [...cluster.items].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))[0];
    const scoring = score(primary, cluster.sources);
    return { id: `hotspot-${index + 1}`, title: primary.title, summary: primary.summary, source: primary.source, sourceUrl: primary.sourceUrl, publishedAt: primary.publishedAt, grade: cluster.sources.some((source) => source.grade === 'A类信源') ? 'A类信源' : 'B类·已核验', category: primary.category, contracts: primary.contracts, sources: cluster.sources.slice(0, 6), scoring, score: scoring.total };
  }).sort((a, b) => b.score - a.score).slice(0, 20);
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

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    await currentProfile(req);
    const baseUrl = (process.env.OMNIDATA_BASE_URL || '').replace(/\/$/, ''), apiToken = (process.env.OMNIDATA_API_TOKEN || '').trim();
    if (!baseUrl || !apiToken) return send(res, 503, { error: 'OMNIDATA_NOT_CONFIGURED' });
    const { sources, configured, configError } = parseSources();
    const headers = { 'Content-Type': 'application/json', 'x-omnidata-token': apiToken };
    // Read OmniData's registry first. A configured source that no longer exists is
    // reported explicitly instead of silently producing an empty hotspot pool.
    const catalog = await listRegisteredSpiders(baseUrl, headers);
    if (catalog) console.info('OmniData registered spiders', catalog.map((spider) => ({ name: spider.name, platform: spider.platform, description: spider.description })));
    const registeredNames = catalog ? new Set(catalog.map((spider) => spider.name)) : null;
    const runnable = registeredNames ? sources.filter((source) => registeredNames.has(source.spider)) : sources;
    const missing = registeredNames ? sources.filter((source) => !registeredNames.has(source.spider)).map((source) => ({ source, ok: false, reason: '该爬虫未在当前 OmniData 服务中注册' })) : [];
    const results = [...await Promise.all(runnable.map((source) => runSource(baseUrl, headers, source))), ...missing];
    const collected = results.flatMap((result) => result.ok ? result.items.map((item, index) => normalizeItem(item, result.source, index)).filter(Boolean) : []);
    const items = clusterItems(collected);
    return send(res, 200, {
      items, refreshedAt: new Date().toISOString(), source: configured ? `已配置 ${sources.length} 个信源` : '默认信源配置',
      pipeline: { collected: collected.length, clustered: items.length, sourcesRequested: sources.length, sourcesSucceeded: results.filter((result) => result.ok).length, registeredSpiderCount: catalog?.length ?? null, configured, configError: Boolean(configError) },
      sourceStatus: results.map((result) => ({ spider: result.source.spider, label: result.source.label || result.source.spider, ok: result.ok, count: result.ok ? result.items.length : 0, reason: result.ok ? undefined : result.reason })),
    });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') return send(res, 401, { error: 'UNAUTHORIZED' });
    console.error('Market hotspot pipeline failed', error);
    return send(res, 500, { error: 'MARKET_HOTSPOTS_UNAVAILABLE' });
  }
};
