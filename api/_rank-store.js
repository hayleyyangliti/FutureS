const {supabase}=require('./_supabase');
const {POLICY,displayWindow,publishable}=require('./_news-policy');
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
function rankingItems(payload){
  // `items` contains the summarized final list while `_pool` keeps the
  // already-scored event candidates. Reading a ranking used to apply a new
  // "now" window to `items` only. That discarded valid overnight/news-session
  // records after the ranking had been published and could turn Top 100 into a
  // single-digit list. Reuse the original collection window and refill from
  // the scored pool; all source/link/time eligibility checks still run in
  // publishable().
  const candidates=[...(Array.isArray(payload?.items)?payload.items:[]),...(Array.isArray(payload?._pool)?payload._pool:[])];
  const seen=new Set(),unique=[];
  for(const item of candidates){const key=rankingIdentity(item);if(!key||seen.has(key))continue;seen.add(key);unique.push(item);}
  return publishable(unique,payload?.collectionWindow||displayWindow(null));
}
function rankingResponse(row){
  const {_pool,...payload}=row.payload||{},items=rankingItems(row.payload||{}).map(({scoringReasons,scoringEvidence,reports,summaryEvidence,summaryInputKey,...item})=>item);
  return {...payload,items,sourceStatus:(payload.sourceStatus||[]).filter(s=>!/jin10|金十|eastmoney|东方财富/i.test((s.spider||'')+' '+(s.label||''))),refreshedAt:row.source_refreshed_at,rankedAt:row.generated_at,
    stale:Date.now()-Date.parse(row.source_refreshed_at)>65*60*1000,
    pipeline:{...payload.pipeline,mode:'BACKGROUND_RANKING',displayed:items.length,rankingCandidates:[...(payload.items||[]),...(_pool||[])].length,policyVersion:POLICY,policyRefreshPending:payload.policyVersion!==POLICY||payload.pipeline?.modelStats?.pending>0,excludedAtRead:(payload.items||[]).length-items.length,domesticDisplayed:items.filter(x=>x.scope==='domestic').length,internationalDisplayed:items.filter(x=>x.scope==='international').length,primaryDisplayed:items.filter(x=>x.grade==='A类信源').length},ai:{...payload.ai,qualityStatus:payload.ai?.status,status:'PRECOMPUTED'}};
}
module.exports={readRanking,claimJob,readCheckpoints,saveProgress,publishRanking,finishJob,rankingResponse,rankingItems};

