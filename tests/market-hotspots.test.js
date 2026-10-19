const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeItem, titleKey, sameHotspot, sameSpeakerLead, isMarketTape, articleUrl, sameEvidence, clusterItems } = require('../api/market-hotspots')._test;
const handler = require('../api/market-hotspots');

const media = { spider: 'yicai_quick_news', label: '第一财经', grade: 'B类·已核验' };
const otherMedia = { spider: 'sina_finance_news', label: '新浪财经', grade: 'B类·已核验' };
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
  const speech = '日本央行行长植田和男（由副行长内田真一代读演讲稿）：';
  assert.equal(sameHotspot(`${speech}成本上升的影响已开始显现在消费价格上`, `${speech}经济、价格与我们的基线预测一致`), true);
  assert.equal(sameHotspot(`${speech}成本上升的影响已开始显现在消费价格上`, '美国央行官员表示将继续关注通胀和就业数据'), false);
});

test('admission rejects unrelated stock stories and generic headlines', () => {
  assert.equal(make('中信证券：关注HDD、DRAM、NAND赛道的投资机会', 1, { content: '原油价格波动也受到关注。' }), null);
  assert.equal(make('期货热点追踪', 2), null);
  assert.ok(make('中信建投：油价或维持区间波动', 3));
  assert.equal(make('韩国检方要求尹锡悦涉无人机案二审维持30年刑期', 4), null);
});

test('long spider titles become core headlines while the complete source text stays below', () => {
  const full = '【德国央行：德国仍将是欧洲的稳定支柱】德国央行行长约阿希姆·纳格尔周五在曼谷表示，在债券市场动荡背景下，德国仍会是欧洲的稳定支柱。历经多年经济停滞，德国正恢复元气。';
  const row = make(full, 4, { content: '' });
  assert.equal(row.title, '德国央行：德国仍将是欧洲的稳定支柱');
  assert.equal(row.summary, full);
  const extra = normalizeItem({ title: row.title, content: '另一报道补充指出德国央行将继续关注欧洲债券市场的变化，同时评估通胀回落、经济增长和后续货币政策路径。', pub_time: '2026-10-16 10:32:00', url: 'https://example.com/extra' }, otherMedia, 5);
  const hotspot = clusterItems([row, extra])[0];
  assert.equal(hotspot.title, row.title);
  assert.equal(hotspot.summary, full);
  assert.equal(hotspot.sources[0].title, row.title);
  assert.equal(make('中信建投：油价或维持区间波动', 5).title, '中信建投：油价或维持区间波动');
});

test('long unbracketed title uses its first fact sentence and keeps the remaining context', () => {
  const full = '欧佩克宣布调整原油产量计划。交易员仍在评估主要产油国的供给变化，以及后续库存数据可能带来的影响。';
  const row = make(full, 6, { content: '' });
  assert.equal(row.title, '欧佩克宣布调整原油产量计划');
  assert.equal(row.summary, full);
});

test('market price moves and opening-session headlines are not admitted as news', () => {
  assert.equal(isMarketTape('燃油涨超5%'), true);
  assert.equal(make('燃油涨超5%', 7), null);
  assert.equal(make('油价涨5.2%', 12), null);
  assert.equal(make('国债期货开盘', 13), null);
  assert.equal(make('国债期货开盘多数上涨', 8), null);
  assert.equal(make('沪铜主力合约盘中拉升', 9), null);
  assert.ok(make('欧佩克宣布调整原油产量计划', 10));
  assert.ok(make('欧佩克宣布减产推动油价上涨', 14));
  assert.ok(make('日本央行行长植田和男：将根据经济形势调整货币政策', 11));
});

test('source links keep original article URLs and resolve known relative paths', () => {
  assert.equal(articleUrl({ url: '/brief/123' }, media), 'https://www.yicai.com/brief/123');
  assert.equal(articleUrl({ url: '//wallstreetcn.com/live/123' }, media), 'https://wallstreetcn.com/live/123');
  assert.equal(articleUrl({ detailUrl: 'https://news.futunn.com/flash/123' }, media), 'https://news.futunn.com/flash/123');
  assert.equal(articleUrl({ url: 'javascript:alert(1)' }, media), '');
  assert.equal(articleUrl({}, media), '');
});

test('duplicate Chinese headlines merge without creating extra corroboration', () => {
  const rows = [
    make('中信建投：油价或维持区间波动', 1, { content: '中信建投预计油价或维持区间波动，机构正在关注海外产油国供给政策和库存变化。' }),
    make('中信建投: 油价或维持区间波动', 2, { content: '中信建投预计油价或维持区间波动，机构正在关注海外产油国供给政策和库存变化。', pub_time: '2026-10-16 10:33:00' }),
    normalizeItem({ title: '中信建投：油价或维持区间波动', content: '另一媒体采访炼厂指出，现货需求疲弱且库存上升，市场仍在等待产油国下一次政策会议的结果。', pub_time: '2026-10-16 10:35:00', url: 'https://example.com/other-oil' }, otherMedia, 3),
    make('国内玉米现货价格小幅波动', 4, { content: '国内玉米现货价格小幅波动，贸易商正观察主产区新粮上市和下游采购节奏。' }),
    normalizeItem({ title: '国内玉米现货价格小幅波动', content: '另一份玉米现货市场调查显示主产区报价略有调整，贸易商仍在观察新粮上市进度和下游采购节奏。', pub_time: '2026-10-16 10:36:00', url: 'https://example.com/other-corn' }, otherMedia, 5),
  ];
  const result = clusterItems(rows);
  assert.equal(result.length, 2);
  const oil = result.find((item) => item.title.includes('油价'));
  assert.equal(oil.duplicateCount, 1);
  assert.equal(oil.sources.length, 2);
  assert.equal(oil.sources[0].url, 'https://example.com/1');
  assert.equal(oil.publishedAt, '2026-10-16T02:30:00.000Z');
  assert.equal(oil.grade, 'B类·已核验');
  assert.equal(oil.score, Object.values(oil.scoring).filter((value) => typeof value === 'number').slice(0, 4).reduce((sum, value) => sum + value, 0));
  assert.deepEqual(result.map((item) => item.score), [...result.map((item) => item.score)].sort((a, b) => b - a));
});

test('five syndicated copies count as one report, while new facts count separately', () => {
  const title = '韩国央行维持基准利率不变';
  const common = '韩国央行宣布维持基准利率不变。声明指出，决策者将继续观察通胀和汇率变化，并在后续会议评估经济增长前景。';
  const copies = ['同花顺', '21财经', '金十数据', '第一财经', '金融界'].map((label, index) => normalizeItem({ title, content: common, url: `https://example.com/wire/${index}`, pub_time: '2026-10-16 14:00:00' }, { spider: `wire${index}`, label, grade: 'B类·已核验' }, index));
  assert.equal(clusterItems(copies).length, 1);
  assert.equal(clusterItems(copies)[0].sources.length, 1);
  const added = normalizeItem({ title, content: '韩国央行维持基准利率不变。另一份独立报道补充了最新公布的出口数据、家庭债务指标和委员会成员对未来利率路径的不同意见。', url: 'https://example.com/new', pub_time: '2026-10-16 14:05:00' }, { spider: 'other', label: '独立媒体', grade: 'B类·已核验' }, 6);
  assert.equal(sameEvidence(copies[0], added), false);
  const withNewFacts = clusterItems([...copies, added])[0];
  assert.equal(withNewFacts.sources.length, 2);
  assert.equal(withNewFacts.duplicateCount, 4);
  assert.equal(withNewFacts.sources[0].title, title);
  assert.equal(withNewFacts.score, clusterItems([copies[0], added])[0].score);
  const noLink = normalizeItem({ title, content: common, pub_time: '2026-10-16 13:59:00' }, { spider: 'no_link', label: '无线索媒体', grade: 'B类·已核验' }, 7);
  assert.equal(clusterItems([noLink, copies[0]])[0].sources[0].url, 'https://example.com/wire/0');
});

test('similar remarks from one speech form one hotspot with one to three sources', () => {
  const lead = '日本央行行长植田和男（由副行长内田真一代读演讲稿）：';
  const remarks = [
    '成本上升的影响已开始显现在消费价格上',
    '经济、价格与我们的基线预测一致',
    '即使在九月份加息后，宽松的金融环境仍继续支持经济活动',
    '存在潜在通胀超出2%的价格目标的风险',
  ];
  const rows = remarks.map((remark, index) => normalizeItem({ title: `${index === 3 ? lead.replace('演讲稿', '讲话稿') : lead}${remark}`, content: `${remark}。第${index + 1}份报道另外给出了不同的政策背景和市场观察，重点涉及经济增长、通胀走势及利率预期。`, pub_time: `2026-10-16 14:3${index}:00`, url: `https://example.com/speech/${index}` }, { spider: `speech${index}`, label: `媒体${index + 1}`, grade: 'B类·已核验' }, index));
  assert.ok(rows.every(Boolean));
  assert.equal(clusterItems(rows).length, 1);
  assert.equal(clusterItems(rows)[0].sources.length, 3);
  const extra = Array.from({ length: 4 }, (_, index) => ({ ...rows[index], source: `补充媒体${index + 1}`, sourceUrl: `https://example.com/additional/${index}`, summary: `补充媒体第${index + 1}篇报道介绍了另一项政策依据，其中包括与其他报道不同的调查结果和决策过程说明。` }));
  assert.equal(clusterItems([...rows, ...extra])[0].sources.length, 3);
});

test('short shared speaker lead merges different central-bank remarks in one session', () => {
  const titles = [
    '日本央行行长植田和男：如果日本央行的政策利率没有得到适当调整，市场对通胀超调风险的担忧可能推高长期利率',
    '日本央行行长植田和男：通过实施适当的货币政策以实现2%的通胀目标',
    '日本央行行长植田和男：现在谈论日本国债的特殊举措并不合适',
    '日本央行行长植田和男：日本央行将全面审视市场状况',
    '日本央行行长：潜在通胀非常接近价格目标',
  ];
  assert.equal(sameSpeakerLead(titles[0], titles[1]), true);
  const rows = titles.map((title, index) => normalizeItem({ title, content: `${title}，这份报道补充了第${index + 1}项不同的政策背景。`, pub_time: `2026-10-19 08:2${index}:00`, url: `https://example.com/speaker/${index}` }, { spider: `speaker${index}`, label: `媒体${index + 1}`, grade: 'B类·已核验' }, index));
  assert.equal(clusterItems(rows).length, 1);
  assert.equal(clusterItems(rows)[0].sources.length, 3);
  assert.equal(sameSpeakerLead(titles[0], '美国央行官员：讨论美元政策'), false);
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
      items: [
        { source: media.spider, item: { title: '中信建投：油价或维持区间波动', content: '中信建投预计油价或维持区间波动，机构正在关注海外产油国供给政策和库存变化。', url: 'https://example.com/oil/1' } },
        { source: otherMedia.spider, item: { title: '中信建投：油价或维持区间波动', content: '另一媒体报道指出，近期炼厂开工和原油现货采购均有变化，投资者还将关注下一次库存数据。', url: 'https://example.com/oil/2' } },
        { source: media.spider, item: { title: '国内玉米现货价格小幅波动', content: '国内玉米现货价格小幅波动，贸易商正观察主产区新粮上市和下游采购节奏。', url: 'https://example.com/corn/1' } },
        { source: otherMedia.spider, item: { title: '国内玉米现货价格小幅波动', content: '另一份现货调查发现不同产区报价存在分化，饲料企业采购计划暂未明显调整。', url: 'https://example.com/corn/2' } },
        { source: 'unverified_spider', item: { title: '未经准入的资讯不得展示' } },
      ],
      sourceStatus: [{ source: media.spider, lastSuccessAt: new Date().toISOString(), lastCount: 3 }],
    } } }]) };
  };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} };
  try {
    await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, url: '/api/market-hotspots' }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.items.length, 2);
    assert.equal(response.body.pipeline.rejected, 1);
    assert.equal(response.body.pipeline.minSources, 1);
    assert.equal(response.body.pipeline.maxSources, 3);
    assert.ok(response.body.items.every((item) => item.score === item.scoring.total && item.sources.length >= 1 && item.sources.length <= 3));
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
      refreshedAt: snapshot, items: [
        { source: media.spider, item: { title: '中信建投：油价或维持区间波动', content: '中信建投认为油价或维持区间波动，相关研究同时讨论了产油国供给变化和全球需求前景。', url: 'https://example.com/original', pub_time: '2026-10-16 10:30:00' } },
        { source: otherMedia.spider, item: { title: '中信建投：油价或维持区间波动', content: '另一媒体报道产油国政策与现货库存的变化，对未来价格可能产生新的影响。', url: 'https://example.com/second', pub_time: '2026-10-16 10:31:00' } },
      ], sourceStatus: [],
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
