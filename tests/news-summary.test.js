const {test}=require('node:test');const assert=require('node:assert/strict');
const {summarizeEvents,evidenceInput,summaryKey,validateSummaries}=require('../api/_news-summary');
const {mergeGroups}=require('../api/_event-consolidation');
const original='主管部门宣布，自11月起实施煤炭进口通关优化，新增夜间通关时段，提升口岸通行效率。';
const rewritten='主管部门将从11月调整煤炭进口通关安排，增加夜间作业时段，以提升口岸通行效率。';
const item=id=>({id,title:'煤炭进口通关安排优化',summary:original,source:'财联社',sources:[{name:'财联社',url:'https://example.com/'+id}],reports:[{source:'财联社',summary:original}],score:79,scoring:{importance:35,timeliness:25,informationGain:10,futuresRelevance:9}});
const row=input=>({id:input.id,title:input.title,summary:rewritten,evidence:[{reportId:input.reports[0].reportId,quote:'新增夜间通关时段，提升口岸通行效率'}]});
test('model summaries require real quotes and reject copied text, templates and invented numbers',()=>{
 const inputs=[evidenceInput(item('a'))],valid=row(inputs[0]);assert.equal(validateSummaries(inputs,{items:[valid]}).size,1);
 for(const summary of [original,'主要事实（财联社）：'+rewritten,rewritten+'通关增长99%。'])assert.equal(validateSummaries(inputs,{items:[{...valid,summary}]}).size,0);
 assert.equal(validateSummaries(inputs,{items:[{...valid,evidence:[{reportId:'r0',quote:'不存在的事实'}]}]}).size,0);
 assert.equal(validateSummaries(inputs,{items:[valid,valid]}).size,0);
});
test('200 character limit is enforced in validation, including punctuation',()=>{
 const inputs=[evidenceInput(item('a'))],valid=row(inputs[0]);
 assert.equal(validateSummaries(inputs,{items:[{...valid,summary:'概括'.repeat(100)}]}).size,1);
 assert.equal(validateSummaries(inputs,{items:[{...valid,summary:'概括'.repeat(100)+'。'}]}).size,0);
});
test('grouping keeps evidence from every member instead of publisher-by-publisher concatenation',()=>{
 const a=item('a'),b={...item('b'),source:'第一财经',reports:[{source:'第一财经',summary:'主管部门补充，通关优化将于11月实施。'}]};
 const merged=mergeGroups([a,b],[{ids:['a','b']}])[0];assert.equal(merged.reports.length,2);assert.ok(!merged.summary.includes('补充报道（'));
 const duplicate=evidenceInput({...a,reports:[...a.reports,...a.reports]});assert.equal(duplicate.reports.length,1);
});
test('20 selected events are summarized in bounded batches, sources unchanged, cached on next background run',async()=>{
 const before=global.fetch,mini=process.env.MINIMAX_API_KEY;process.env.MINIMAX_API_KEY='test';let calls=0,active=0,max=0;
 global.fetch=async(url,options)=>{calls++;active++;max=Math.max(max,active);const body=JSON.parse(options.body),inputs=JSON.parse(body.messages[1].content).items;assert.ok(inputs.length<=5);assert.ok(body.messages[0].content.includes('演练不是实际打击'));await new Promise(r=>setImmediate(r));active--;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:inputs.map(row)})}}]})};};
 try{const input=Array.from({length:20},(_,i)=>item('event-'+i)),result=await summarizeEvents(input);assert.equal(calls,4);assert.ok(max<=4);assert.equal(result.pending,0);
 for(let i=0;i<20;i++){assert.equal(result.items[i].summary,rewritten);assert.equal(result.items[i].summaryType,'SOURCE_SYNTHESIS');assert.equal(result.items[i].summaryMethod,'MODEL_SUMMARY');assert.deepEqual(result.items[i].sources,input[i].sources);}
 const cached=await summarizeEvents(input.map((x,i)=>({...x,id:'changed-'+i})),result.items);assert.equal(calls,4);assert.equal(cached.pending,0);
 const changed={...input[0],reports:[{source:'财联社',summary:original+'新增一个事实。'}]};assert.notEqual(summaryKey(changed),summaryKey(input[0]));
 }finally{global.fetch=before;mini===undefined?delete process.env.MINIMAX_API_KEY:process.env.MINIMAX_API_KEY=mini;}
});
test('DeepSeek only retries missing summaries; total failure is explicit and never disguised as synthesis',async()=>{
 const before=global.fetch,mini=process.env.MINIMAX_API_KEY,deep=process.env.DEEPSEEK_API_KEY;process.env.MINIMAX_API_KEY='test';process.env.DEEPSEEK_API_KEY='test';const sizes=[];
 global.fetch=async(url,options)=>{const body=JSON.parse(options.body),inputs=JSON.parse(body.messages[1].content).items,isMini=String(url).includes('minimaxi');sizes.push(inputs.length);if(!isMini)assert.deepEqual(body.thinking,{type:'disabled'});return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:(isMini?inputs.slice(0,1):inputs).map(row)})}}]})};};
 try{const result=await summarizeEvents([item('a'),item('b')]);assert.deepEqual(sizes,[2,1]);assert.equal(result.pending,0);
 global.fetch=async()=>{throw Error('network')};const failed=await summarizeEvents([item('z')]);assert.equal(failed.pending,1);assert.equal(failed.items[0].summaryMethod,'PENDING');assert.ok(!failed.items[0].summary.includes(original));assert.equal(failed.items[0].sources.length,1);
 const deferred=await summarizeEvents([item('d')],[],{budgetMs:0});assert.equal(deferred.pending,1);
 }finally{global.fetch=before;mini===undefined?delete process.env.MINIMAX_API_KEY:process.env.MINIMAX_API_KEY=mini;deep===undefined?delete process.env.DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY=deep;}
});
test('background worker saves model summaries without changing ranking scores or source links',async()=>{
 const handler=require('../api/internal/hotspot-refresh'),before=global.fetch;
 const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','HOTSPOT_JOB_SECRET','MINIMAX_API_KEY'],old=names.map(x=>process.env[x]);
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test',HOTSPOT_JOB_SECRET:'test',MINIMAX_API_KEY:'test'});
 const version=new Date().toISOString();let published,finished;const db=value=>({ok:true,text:async()=>JSON.stringify(value)});
 global.fetch=async(url,options={})=>{
  const path=String(url);
  if(path.includes('/omnidata_news_snapshots?'))return db([{payload:{data:{refreshedAt:version,items:[{source:'cls_global_news',item:{title:'煤炭进口通关安排优化',content:original,pub_time:version,url:'https://www.cls.cn/detail/123456'}}]}}}]);
  if(path.includes('/rpc/claim_omnidata_hotspot_job'))return db(true);
  if(path.includes('/omnidata_hotspot_rankings?'))return db([{source_refreshed_at:version,payload:{policyVersion:require('../api/_news-policy').POLICY,items:[],_pool:[],collectionWindow:{version:2,tradingDate:new Date(Date.now()+8*3600000).toISOString().slice(0,10),firstOfDay:false}}}]);
  if(path.includes('/omnidata_hotspot_jobs?')&&options.method!=='PATCH')return db([]);
  if(path.includes('/omnidata_hotspot_jobs?')){finished=JSON.parse(options.body);return db(null);}
  if(path.includes('/rpc/publish_omnidata_hotspot_ranking')){published=JSON.parse(options.body).p_payload;return db(true);}
  const body=JSON.parse(options.body),inputs=JSON.parse(body.messages[1].content).items;
  const rows=body.messages[0].content.includes('财经新闻编辑')?inputs.map(row):inputs.map(x=>({id:x.id,admit:true,importance:35,informationGain:10,futuresRelevance:20,theme:'logistics',reasons:{importance:'政策事实',informationGain:'新通关安排',futuresRelevance:'煤炭供给'},evidence:'新增夜间通关时段',scope:'domestic',category:'黑色',contracts:['焦煤'],eventKey:'11月煤炭进口通关安排'}));
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:rows})}}]})};
 };
 try{const res={setHeader(){},status(code){this.code=code;return this},json(value){this.body=value}};await handler({method:'POST',headers:{authorization:'Bearer test'}},res);
 assert.equal(res.code,200);assert.equal(published.items[0].summary,rewritten);assert.equal(published.items[0].score,85);assert.equal(published.items[0].sources[0].url,'https://www.cls.cn/detail/123456');assert.equal(finished.status,'completed');assert.equal(finished.detail.stats.summaryPending,0);
 }finally{global.fetch=before;names.forEach((name,i)=>old[i]===undefined?delete process.env[name]:process.env[name]=old[i]);}
});

