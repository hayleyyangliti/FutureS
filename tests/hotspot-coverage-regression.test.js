const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeItem,qualifiesArticleLength,qualifiesShortCandidate,clusterItems,diagnoseFeed,newsScope,scoreCandidatePool}=require('../api/market-hotspots')._test;
const source={spider:'cls_global_news',label:'财联社',grade:'B类·已核验'};
const longBody='有关部门披露了本次调查的统计口径及执行范围，要求有关单位依据实际情况落实安排，并持续跟踪后续运行情况。报道提供了调查背景、正式文件发布时间、适用地区及落实进度，具体执行仍以主管部门后续公告为准。有关企业将根据实际订单情况安排生产，后续数据仍需持续观察，不能将此次变化直接视为价格方向的确定性判断。';
test('domestic commodity drivers in body are admitted even without title keywords',()=>{
 const raw={title:'新疆多地公布新一轮工作安排',news_content:'当地棉花采收进度加快，棉花产量及供应安排已经公布。'+longBody,url:'https://www.cls.cn/detail/100',pub_time:'2026-10-20 14:00:00'};
 assert.ok(qualifiesArticleLength(raw));const row=normalizeItem(raw,source,0);assert.ok(row);assert.equal(row.scope,'domestic');assert.equal(row.category,'农产品');
});
test('domestic monetary and fiscal actions no longer require literal GDP or futures title',()=>{
 for(const title of ['财政部公布新一轮专项债发行计划','人民银行开展公开市场逆回购操作'])assert.equal(normalizeItem({title,content:longBody},source,0).scope,'domestic');
 assert.equal(newsScope('美国财政部公布债券发行安排'),'international');
 assert.equal(normalizeItem({title:'山东：到2030年全域旅游及相关产业增加值占GDP比重达到6%左右',content:longBody},source,0),null);
});
test('short summaries never hide a longer body, structured objects never inflate length',()=>{
 const row=normalizeItem({title:'农业农村部发布最新调查结果',summary:'摘要',body:'全国玉米产量调查公布，后续粮食供应将随新粮收割进度变化。'+longBody},source,1);
 assert.ok(row);assert.ok(row.summary.length>130);
 assert.equal(qualifiesArticleLength({content:{arbitrary:'x'.repeat(500)}}),false);
});
test('shared publisher homepage does not merge different domestic events',()=>{
 const first=normalizeItem({title:'央行开展公开市场逆回购操作',content:longBody,url:'https://www.cls.cn/'},source,0);
 const second=normalizeItem({title:'新疆棉花产量调查结果公布',content:'新疆棉花产量增加，棉花供应安排调整。'+longBody,url:'https://www.cls.cn/'},source,1);
 assert.equal(first.sourceUrl,'');assert.equal(second.sourceUrl,'');assert.equal(clusterItems([first,second],null).length,2);
});
test('source diagnostics reconcile all losses and distinguish geography',()=>{
 const rows=diagnoseFeed([
 {source:source.spider,item:{title:'短快讯',content:'很短'}},
 {source:source.spider,item:{title:'电影节公布活动安排',content:longBody}},
 {source:source.spider,item:{title:'新疆棉花产量调查结果公布',content:longBody}},
 {source:'unapproved',item:{title:'忽略'}}]);
 assert.deepEqual(rows[0],{source:source.spider,raw:3,rejectedShort:1,shortCandidates:0,rejectedRelevanceOrTape:1,accepted:1,domestic:1,international:0,other:0});
});
test('short notices require valid model importance and relevance; price tape stays excluded',async()=>{
 const raw={title:'央行决定降低存款准备金率0.5个百分点'};assert.equal(qualifiesShortCandidate(raw),true);
 assert.equal(normalizeItem({title:'国债期货开盘上涨超过1%'},source,0),null);
 const normalized=normalizeItem(raw,source,0);assert.equal(normalized.shortNotice,true);
 const high={...clusterItems([normalized],null)[0],id:'short-high'},low={...high,id:'short-low'};
 const previous=global.fetch,oldKey=process.env.MINIMAX_API_KEY;process.env.MINIMAX_API_KEY='test';
 global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:[high,low].map(x=>({id:x.id,importance:x.id==='short-high'?35:20,informationGain:8,futuresRelevance:8,reasons:{importance:'政策影响范围',informationGain:'新增政策事实',futuresRelevance:'货币政策传导'},evidence:'降低存款准备金率'}))})}}]})});
 try{const r=await scoreCandidatePool([high,low]);assert.equal(r.items.length,1);assert.equal(r.items[0].id,'short-high');assert.equal(r.shortAdmitted,1);}
 finally{global.fetch=previous;oldKey===undefined?delete process.env.MINIMAX_API_KEY:process.env.MINIMAX_API_KEY=oldKey;}
 const unavailable=await scoreCandidatePool([{...high,id:'short-unavailable'}]);assert.equal(unavailable.items.length,0);
});
test('model pool fallback retains domestic slots and only caps at final selection',async()=>{
 const all=Array.from({length:30},(_,i)=>({id:`pool-${i}`,title:`国内玉米产量调查${i}`,summary:longBody,sources:[],scope:i<24?'international':'domestic',score:100-i,scoring:{importance:30,timeliness:22,informationGain:7,futuresRelevance:6,total:65}}));
 const previous=global.fetch;global.fetch=async()=>{throw Error('offline')};
 try{const r=await scoreCandidatePool(all);assert.equal(r.items.length,20);assert.equal(r.items.filter(x=>x.scope==='domestic').length,5);}finally{global.fetch=previous;}
});
