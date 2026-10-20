const {test}=require('node:test');const assert=require('node:assert/strict');
const {prepareModelItem}=require('../api/market-hotspots')._test;
const {evaluateSnapshot,validateDecisions,aggregate}=require('../api/_model-news');
const raw=(i,title='央行降准公告')=>prepareModelItem({source:'cls_global_news',item:{title,pub_time:new Date().toISOString(),url:`https://example.com/news/${i}`}},i);
const approve=item=>({id:item.id,admit:true,importance:30,informationGain:7,futuresRelevance:6,reasons:{importance:'政策事实',informationGain:'新增信息',futuresRelevance:'存在政策传导'},evidence:item.title,scope:'domestic',category:'宏观',eventKey:`央行事件${item.id}`});
test('all text goes to model irrespective of length, price words or keyword relevance',()=>{
 for(const title of ['央行降准','燃油涨超5%','电影节开幕','不含关键词的事实报道'])assert.ok(raw(0,title));
 assert.equal(prepareModelItem({source:'cls_global_news',item:{}},0),null);
});
test('every model decision is required; rejects may omit scores',()=>{
 const items=[raw(1),raw(2)];assert.equal(validateDecisions(items,{items:[approve(items[0]),{id:items[1].id,admit:false,reason:'纯行情'}]}).size,2);
 assert.throws(()=>validateDecisions(items,{items:[approve(items[0])]}));
 assert.throws(()=>validateDecisions([items[0]],{items:[{...approve(items[0]),importance:46}]}));
 assert.throws(()=>validateDecisions([items[0]],{items:[{...approve(items[0]),evidence:'虚构引用'}]}));
});
test('no numerical gate overrides a model admission, and model rejection is respected',()=>{
 const items=[raw(1),raw(2)];const rows=validateDecisions(items,{items:[{...approve(items[0]),importance:1,futuresRelevance:1},{id:items[1].id,admit:false,reason:'不相关'}]});
 const result=aggregate(items,[{rows,provider:'MiniMax',model:'test',failures:[]}]);assert.equal(result.items.length,1);assert.equal(result.items[0].shortNotice,true);assert.equal(result.stats.rejected,1);
});
test('shared model event keys merge without title-similarity rules, sources capped at three',()=>{
 const items=Array.from({length:5},(_,i)=>({...raw(i),sources:[{name:`source${i}`}]}));const rows=validateDecisions(items,{items:items.map(x=>({...approve(x),eventKey:'同一事件'}))});
 const result=aggregate(items,[{rows,provider:'MiniMax',model:'test',failures:[]}]);assert.equal(result.items.length,1);assert.equal(result.items[0].sources.length,3);
});
test('500 records reach model; bounded concurrency, no 60-candidate truncation, deduped request cache',async()=>{
 const before=global.fetch,mini=process.env.MINIMAX_API_KEY;process.env.MINIMAX_API_KEY='test';let calls=0,active=0,maxActive=0,seen=0;
 global.fetch=async(url,options)=>{calls++;active++;maxActive=Math.max(active,maxActive);const items=JSON.parse(JSON.parse(options.body).messages[1].content).items;seen+=items.length;await new Promise(resolve=>setImmediate(resolve));active--;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:items.map(approve)})}}]})};};
 try{const input=Array.from({length:500},(_,i)=>raw(1000+i));const r=await evaluateSnapshot(input);assert.equal(seen,500);assert.equal(calls,25);assert.ok(maxActive<=5);assert.equal(r.stats.evaluated,500);assert.equal(r.items.length,20);await evaluateSnapshot(input);assert.equal(calls,25);}
 finally{global.fetch=before;mini===undefined?delete process.env.MINIMAX_API_KEY:process.env.MINIMAX_API_KEY=mini;}
});
test('MiniMax failure switches to DeepSeek; total failure never supplies rule-scored articles',async()=>{
 const before=global.fetch,mini=process.env.MINIMAX_API_KEY,deep=process.env.DEEPSEEK_API_KEY;process.env.MINIMAX_API_KEY='test';process.env.DEEPSEEK_API_KEY='test';
 global.fetch=async(url,options)=>String(url).includes('minimaxi')?{ok:false,status:429}:{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:JSON.parse(JSON.parse(options.body).messages[1].content).items.map(approve)})}}]})};
 try{const r=await evaluateSnapshot([raw(800)]);assert.equal(r.provider,'DeepSeek');assert.equal(r.items[0].scoringMethod,'MODEL');
 global.fetch=async()=>{throw Error('network')};const failed=await evaluateSnapshot([raw(801)]);assert.equal(failed.status,'MODEL_UNAVAILABLE');assert.equal(failed.items.length,0);assert.equal(failed.stats.failed,1);}
 finally{global.fetch=before;mini===undefined?delete process.env.MINIMAX_API_KEY:process.env.MINIMAX_API_KEY=mini;deep===undefined?delete process.env.DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY=deep;}
});
