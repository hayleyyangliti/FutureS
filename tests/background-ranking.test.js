const {test}=require('node:test');const assert=require('node:assert/strict');
const {rankingResponse}=require('../api/_rank-store');
const {mergeGroups,validateGroups}=require('../api/_event-consolidation');
const job=require('../api/internal/hotspot-refresh');
const handler=require('../api/market-hotspots');
const item=(id,source='财联社')=>({id,title:'央行宣布降准',summary:'央行公布政策事实与实施日期',source,publishedAt:new Date().toISOString(),sources:[{name:source,url:'https://example.com/article/'+id}],scoring:{importance:35,timeliness:25,informationGain:10,futuresRelevance:9},score:79,scope:'domestic'});
test('public ranking excludes private pool and model explanations',()=>{
 const result=rankingResponse({payload:{_pool:[{secret:'internal'}],items:[{...item('a'),scoringReasons:{importance:'private'},scoringEvidence:'private'}]},source_refreshed_at:new Date().toISOString()});
 assert.equal(result._pool,undefined);assert.equal(result.items[0].scoringReasons,undefined);assert.equal(result.items[0].scoringEvidence,undefined);assert.equal(result.pipeline.mode,'BACKGROUND_RANKING');
});
test('cross-source grouping preserves every event once and caps sources at three',()=>{
 const events=[item('a'),item('b','新浪财经'),item('c','金十数据'),item('d','同花顺')];
 assert.throws(()=>validateGroups(events,{groups:[{ids:['a','b']}]}));
 assert.throws(()=>validateGroups(events,{groups:[{ids:['a','a','b','c','d']}]}));
 const groups=validateGroups(events,{groups:[{ids:['a','b','c','d']}]});const result=mergeGroups(events,groups);
 assert.equal(result.length,1);assert.equal(result[0].sources.length,3);assert.equal(result[0].summaryType,'SOURCE_SYNTHESIS');
 assert.equal(result[0].scoring.informationGain,10);
});
test('recent model-approved pool retains older events but expires after 24 hours',()=>{
 const current=item('a'),recent={...item('b'),title:'国内口岸通关'},expired={...item('c'),title:'过期事件',publishedAt:new Date(Date.now()-25*3600000).toISOString()};
 assert.equal(job._test.combinePool([current],[recent,expired]).length,2);
});
test('job rejects unauthenticated callers without database or model access',async()=>{
 const old=process.env.HOTSPOT_JOB_SECRET;process.env.HOTSPOT_JOB_SECRET='test-only';
 const res={setHeader(){},status(code){this.code=code;return this},json(value){this.body=value}};
 try{await job({method:'POST',headers:{}},res);assert.equal(res.code,401);}finally{old===undefined?delete process.env.HOTSPOT_JOB_SECRET:process.env.HOTSPOT_JOB_SECRET=old}
});
test('frontend reads completed ranking without snapshot read or model calls, including analysis requests',async()=>{
 const before=global.fetch,keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'],env=keys.map(k=>process.env[k]);let reads=0;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'});
 global.fetch=async(url)=>{
   if(String(url).endsWith('/rpc/current_profile'))return {ok:true,json:async()=>[{auth_user_id:'test'}]};
   assert.ok(String(url).includes('/omnidata_hotspot_rankings?'));reads++;
   return {ok:true,text:async()=>JSON.stringify([{payload:{items:[item('ready')]},source_refreshed_at:new Date().toISOString(),generated_at:new Date().toISOString()}])};
 };
 try{for(const url of ['/api/market-hotspots','/api/market-hotspots?analysis=1']){const res={setHeader(){},status(code){this.code=code;return this},json(value){this.body=value}};await handler({method:'GET',headers:{authorization:'Bearer test'},url},res);assert.equal(res.code,200);assert.equal(res.body.items[0].id,'ready');}assert.equal(reads,2)}
 finally{global.fetch=before;keys.forEach((k,i)=>env[i]===undefined?delete process.env[k]:process.env[k]=env[i])}
});
