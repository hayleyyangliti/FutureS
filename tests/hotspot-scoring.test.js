const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreHotspots, validate, applyScores } = require('../api/_hotspot-scoring');
const item = id => ({ id, title: `山东旅游占GDP目标${id}`, summary: '到2030年旅游产业占GDP比重达到6%左右。', sources: [{ name: '第一财经', excerpt: '地方旅游规划' }], scoring: { importance: 30, timeliness: 22, informationGain: 7, futuresRelevance: 6, total: 65 }, score: 65 });
const row = id => ({ id, importance: 8, informationGain: 7, futuresRelevance: 0, reasons: { importance: '地方远期产业规划', informationGain: '新增规划目标', futuresRelevance: '无明确期货传导关系' }, evidence: '' });
test('validation rejects ranges, missing ids, duplicate ids and fabricated evidence', () => {
  for (const output of [[], [row('wrong')], [{ ...row('a'), importance: 46 }], [{ ...row('a'), futuresRelevance: 5 }], [{ ...row('a'), evidence: '虚构原文' }]]) {
    assert.throws(() => validate([item('a')], { items: output }));
  }
  assert.throws(() => validate([item('a'), item('b')], { items: [row('a'), row('a')] }));
});
test('keeps deterministic time, totals model dimensions and resorts by new total', () => {
  const a=item('a'),b=item('b');
  const rows=validate([a,b], { items: [row('a'), { ...row('b'), importance: 35 }] });
  const results=applyScores([a,b], { rows, model:'test',provider:'MiniMax' });
  assert.equal(results[0].id,'b'); assert.equal(results[1].score,37);
  assert.equal(results[1].scoring.timeliness,22);assert.equal(results[1].title,a.title);
});
test('invalid MiniMax falls back to DeepSeek; successful response is cached', async () => {
  const previous=global.fetch, mini=process.env.MINIMAX_API_KEY, deep=process.env.DEEPSEEK_API_KEY;
  process.env.MINIMAX_API_KEY='test';process.env.DEEPSEEK_API_KEY='test';const calls=[];
  global.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:[String(url).includes('minimaxi')?{...row('fallback'),importance:46}:row('fallback')]})}}]})}};
  try{const result=await scoreHotspots([item('fallback')]);assert.equal(result.provider,'DeepSeek');assert.equal(result.items[0].score,37);await scoreHotspots([item('fallback')]);assert.equal(calls.length,2);}
  finally{global.fetch=previous;mini===undefined?delete process.env.MINIMAX_API_KEY:process.env.MINIMAX_API_KEY=mini;deep===undefined?delete process.env.DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY=deep;}
});
test('both providers fail: explicitly returns original rule score, never model status', async () => {
  const previous=global.fetch;global.fetch=async()=>{throw new Error('unavailable')};
  try{const result=await scoreHotspots([item('failed')]);assert.equal(result.status,'RULE_FALLBACK');assert.equal(result.items[0].scoringMethod,'RULE_FALLBACK');assert.equal(result.items[0].score,65);}
  finally{global.fetch=previous;}
});
