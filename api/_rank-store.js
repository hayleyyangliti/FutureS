const {supabase}=require('./_supabase');
async function readRanking(){
  try {const rows=await supabase('/rest/v1/omnidata_hotspot_rankings?id=eq.current&select=payload,source_refreshed_at,generated_at&limit=1');return rows?.[0]||null;}
  catch(error){if(['PGRST205','42P01'].includes(error.code))return null;throw error;}
}
async function claimJob(key,token){return await supabase('/rest/v1/rpc/claim_omnidata_hotspot_job',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:key,p_token:token})});}
async function readCheckpoints(){
  const rows=await supabase('/rest/v1/omnidata_hotspot_jobs?job_key=like.model-v2-*&select=detail&order=updated_at.desc&limit=6');
  return (rows||[]).flatMap(row=>row.detail?.evaluations||[]).sort((a,b)=>a.at-b.at);
}
async function saveProgress(key,token,detail){return await supabase('/rest/v1/omnidata_hotspot_jobs?job_key=eq.'+encodeURIComponent(key)+'&lease_token=eq.'+encodeURIComponent(token),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({detail,updated_at:new Date().toISOString()})});}
async function publishRanking(payload,sourceVersion){return await supabase('/rest/v1/rpc/publish_omnidata_hotspot_ranking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_payload:payload,p_source_version:sourceVersion})});}
async function finishJob(key,token,status,detail){return await supabase('/rest/v1/omnidata_hotspot_jobs?job_key=eq.'+encodeURIComponent(key)+'&lease_token=eq.'+encodeURIComponent(token),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,detail,locked_until:new Date(0).toISOString(),updated_at:new Date().toISOString()})});}
function rankingResponse(row){
  const {_pool,...payload}=row.payload||{},items=(payload.items||[]).map(({scoringReasons,scoringEvidence,reports,...item})=>item);
  return {...payload,items,refreshedAt:row.source_refreshed_at,rankedAt:row.generated_at,
    stale:Date.now()-Date.parse(row.source_refreshed_at)>65*60*1000,
    pipeline:{...payload.pipeline,mode:'BACKGROUND_RANKING'},ai:{...payload.ai,qualityStatus:payload.ai?.status,status:'PRECOMPUTED'}};
}
module.exports={readRanking,claimJob,readCheckpoints,saveProgress,publishRanking,finishJob,rankingResponse};
