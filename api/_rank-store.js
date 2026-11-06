const {supabase}=require('./_supabase');
const {POLICY,articleLink,isRoundup}=require('./_news-policy');
async function readRanking(){
  try {const rows=await supabase('/rest/v1/omnidata_hotspot_rankings?id=eq.current&select=payload,source_refreshed_at,generated_at&limit=1');return rows?.[0]||null;}
  catch(error){if(['PGRST205','42P01'].includes(error.code))return null;throw error;}
}
async function claimJob(key,token){return await supabase('/rest/v1/rpc/claim_omnidata_hotspot_job',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:key,p_token:token})});}
async function readCheckpoints(){
  const rows=await supabase('/rest/v1/omnidata_hotspot_jobs?job_key=like.model-v*&select=detail&order=updated_at.desc&limit=6');
  return (rows||[]).flatMap(row=>row.detail?.evaluations||[]).sort((a,b)=>a.at-b.at);
}
async function saveProgress(key,token,detail){return await supabase('/rest/v1/omnidata_hotspot_jobs?job_key=eq.'+encodeURIComponent(key)+'&lease_token=eq.'+encodeURIComponent(token),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({detail,updated_at:new Date().toISOString()})});}
async function publishRanking(payload,sourceVersion){return await supabase('/rest/v1/rpc/publish_omnidata_hotspot_ranking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_payload:payload,p_source_version:sourceVersion})});}
async function finishJob(key,token,status,detail){return await supabase('/rest/v1/omnidata_hotspot_jobs?job_key=eq.'+encodeURIComponent(key)+'&lease_token=eq.'+encodeURIComponent(token),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,detail,locked_until:new Date(0).toISOString(),updated_at:new Date().toISOString()})});}
function rankingIdentity(item){
  return String(item?.eventKey||item?.sourceUrl||`${item?.title||''}\u0000${item?.publishedAt||''}`);
}
const AGRICULTURE_EVIDENCE=/豆[粕油]|大豆|玉米|小麦|棉花|白糖|生猪|鸡蛋|苹果|红枣|油脂|粮食|农产品|饲料|收储|播种|收割|农业农村/;
const MACRO_INFRASTRUCTURE=/人工智能|\bAI\b|新型基础设施|新基建|算力|机器人|数字经济|何立峰/;
function presentationCategory(item){
  const evidence=`${item?.title||''} ${item?.summary||''}`;
  // Never classify broad policy/technology news as agriculture merely because
  // a model supplied a stale label; a product or agricultural fact is required.
  if((item?.category==='农产品'&&!AGRICULTURE_EVIDENCE.test(evidence))||(MACRO_INFRASTRUCTURE.test(evidence)&&!AGRICULTURE_EVIDENCE.test(evidence)))return '宏观';
  return item?.category||'宏观';
}
function rankingItems(payload){
  // A stored ranking is already admitted and scored for its collection window.
  // Do not apply a second moving "now" window when the reader opens the page:
  // it can erase an otherwise valid Top 100 a few minutes after publication.
  // At read time retain only the non-time-based safety checks (a source link
  // and the exclusion of media roundups), then run the deterministic merge.
  const candidates=[...(Array.isArray(payload?.items)?payload.items:[]),...(Array.isArray(payload?._pool)?payload._pool:[])];
  const seen=new Set(),unique=[];
  for(const item of candidates){const key=rankingIdentity(item);if(!key||seen.has(key))continue;seen.add(key);unique.push(item);}
  const eligible=unique.map(item=>{
    if(!item||isRoundup(item.originalTitle||item.title))return null;
    const sources=(Array.isArray(item.sources)?item.sources:[]).map(source=>({...source,url:articleLink(source?.url)})).filter(source=>source.url).slice(0,3);
    const sourceUrl=articleLink(item.sourceUrl)||sources[0]?.url||'';
    if(!sourceUrl)return null;
    return {...item,category:presentationCategory(item),sourceUrl,sources:sources.length?sources:[{name:item.source||'已核验信源',url:sourceUrl,publishedAt:item.publishedAt,grade:item.grade,title:item.title,excerpt:item.summary||''}]};
  }).filter(Boolean);
  // The payload has already been event-clustered and ranked before publication.
  // Running broad semantic grouping again when a reader opens the page was
  // collapsing unrelated items and turning a Top 100 into a few dozen cards.
  // Only strict identity de-duplication above is safe at read time; preserve
  // the published score order and replenish from the saved candidate pool.
  return eligible.slice(0,100);
}
function rankingResponse(row){
  const {_pool,...payload}=row.payload||{},items=rankingItems(row.payload||{}).map(({scoringReasons,scoringEvidence,reports,summaryEvidence,summaryInputKey,...item})=>item);
  return {...payload,items,sourceStatus:(payload.sourceStatus||[]).filter(s=>!/jin10|金十|eastmoney|东方财富/i.test((s.spider||'')+' '+(s.label||''))),refreshedAt:row.source_refreshed_at,rankedAt:row.generated_at,
    stale:Date.now()-Date.parse(row.source_refreshed_at)>65*60*1000,
    pipeline:{...payload.pipeline,mode:'BACKGROUND_RANKING',displayed:items.length,rankingCandidates:[...(payload.items||[]),...(_pool||[])].length,policyVersion:POLICY,policyRefreshPending:payload.policyVersion!==POLICY||payload.pipeline?.modelStats?.pending>0,excludedAtRead:(payload.items||[]).length-items.length,domesticDisplayed:items.filter(x=>x.scope==='domestic').length,internationalDisplayed:items.filter(x=>x.scope==='international').length,primaryDisplayed:items.filter(x=>x.grade==='A类信源').length},ai:{...payload.ai,qualityStatus:payload.ai?.status,status:'PRECOMPUTED'}};
}
module.exports={readRanking,claimJob,readCheckpoints,saveProgress,publishRanking,finishJob,rankingResponse,rankingItems};

