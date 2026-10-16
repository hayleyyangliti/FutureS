const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeItem, titleKey, sameHotspot, clusterItems } = require('../api/market-hotspots')._test;
const handler = require('../api/market-hotspots');

const media = { spider: 'yicai_quick_news', label: '第一财经', grade: 'B类·已核验' };
const make = (title, index, overrides = {}) => normalizeItem({
  title,
  content: `${title}，机构观点仍需结合后续库存数据核验。`,
  pub_time: '2026-10-16 10:30:00',
  url: `https://example.com/${index}`,
  ...overrides,
}, media, index);

test('Chinese punctuation and full-width characters normalize without losing the title', () => {
  assert.equal(titleKey('中信建投：油价或维持区间波动'), titleKey('中信建投: 油价或维持区间波动'));
  assert.equal(sameHotspot('中信建投：油价或维持区间波动', '中信建投: 油价或维持区间波动'), true);
  assert.equal(sameHotspot('中信建投：油价或维持区间波动', '中信建投：铜价或维持区间波动'), false);
});

test('duplicate Chinese headlines merge, preserve original links, and sort by calculated score', () => {
  const rows = [
    make('中信建投：油价或维持区间波动', 1),
    make('中信建投: 油价或维持区间波动', 2, { pub_time: '2026-10-16 10:33:00' }),
    make('国内玉米现货价格小幅波动', 3),
  ];
  const result = clusterItems(rows);
  assert.equal(result.length, 2);
  const oil = result.find((item) => item.title.includes('油价'));
  assert.equal(oil.duplicateCount, 1);
  assert.equal(oil.sources.length, 2);
  assert.equal(oil.publishedAt, '2026-10-16T02:30:00.000Z');
  assert.equal(oil.grade, 'B类·已核验');
  assert.equal(oil.score, Object.values(oil.scoring).filter((value) => typeof value === 'number').slice(0, 4).reduce((sum, value) => sum + value, 0));
  assert.deepEqual(result.map((item) => item.score), [...result.map((item) => item.score)].sort((a, b) => b - a));
});

test('cached feed responds with deduplicated, ranked items and source provenance', async () => {
  const previousFetch = global.fetch;
  const previousEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MINIMAX_API_KEY'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test', SUPABASE_SERVICE_ROLE_KEY: 'server-test' });
  delete process.env.MINIMAX_API_KEY;
  global.fetch = async (url) => {
    if (String(url).endsWith('/rpc/current_profile')) return { ok: true, json: async () => [{ auth_user_id: 'test-user' }] };
    return { ok: true, text: async () => JSON.stringify([{ updated_at: new Date().toISOString(), payload: { data: {
      refreshedAt: new Date().toISOString(), tradingDate: true,
      items: [...[make('中信建投：油价或维持区间波动', 1), make('中信建投: 油价或维持区间波动', 2), make('国内玉米现货价格小幅波动', 3)].map((item) => ({ source: media.spider, item })), { source: 'unverified_spider', item: { title: '未经准入的资讯不得展示' } }],
      sourceStatus: [{ source: media.spider, lastSuccessAt: new Date().toISOString(), lastCount: 3 }],
    } } }]) };
  };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} };
  try {
    await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, url: '/api/market-hotspots' }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.items.length, 2);
    assert.equal(response.body.pipeline.rejected, 1);
    assert.ok(response.body.items.every((item) => item.score === item.scoring.total && item.sources.length));
    assert.equal(response.body.ai.status, 'MINIMAX_NOT_CONFIGURED');
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('analysis request enriches only the excerpt, without changing verified headline or sources', async () => {
  const previousFetch = global.fetch;
  const previousEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MINIMAX_API_KEY'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test', SUPABASE_SERVICE_ROLE_KEY: 'server-test', MINIMAX_API_KEY: 'model-test' });
  const snapshot = '2026-10-16T11:00:00.000Z';
  global.fetch = async (url) => {
    if (String(url).endsWith('/rpc/current_profile')) return { ok: true, json: async () => [{ auth_user_id: 'test-user' }] };
    if (String(url).includes('api.minimaxi.com')) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ items: [{ id: 'hotspot-1', title: '不应覆盖原题', summary: '已采集资讯提供了机构对油价波动区间的观点；其依据和适用时间仍需查验原文，不能将该观点理解为确定的价格预测或交易建议。' }] }) } }] }) };
    return { ok: true, text: async () => JSON.stringify([{ updated_at: snapshot, payload: { data: {
      refreshedAt: snapshot, items: [{ source: media.spider, item: { title: '中信建投：油价或维持区间波动', content: '中信建投认为油价或维持区间波动。', url: 'https://example.com/original', pub_time: '2026-10-16 10:30:00' } }], sourceStatus: [],
    } } }]) };
  };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} };
  try {
    await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, url: '/api/market-hotspots?analysis=1' }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.ai.status, 'GENERATED');
    assert.equal(response.body.items[0].summaryType, 'AI_DRAFT');
    assert.equal(response.body.items[0].title, '中信建投：油价或维持区间波动');
    assert.equal(response.body.items[0].sources[0].url, 'https://example.com/original');
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
