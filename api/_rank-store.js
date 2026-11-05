const {supabase}=require('./_supabase');
const {POLICY,articleLink,isRoundup}=require('./_news-policy');
const {deterministicGroups,mergeGroups}=require('./_event-consolidation');
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
    return {...item,sourceUrl,sources:sources.length?sources:[{name:item.source||'已核验信源',url:sourceUrl,publishedAt:item.publishedAt,grade:item.grade,title:item.title,excerpt:item.summary||''}]};
  }).filter(Boolean);
  const indexed=eligible.map((item,index)=>({...item,id:item.id||`published-${index}`}));
  // A malformed legacy cache entry must never make the entire hotspot and
  // source-monitoring API unavailable. It can safely be displayed unmerged
  // while the background job writes a normalized replacement.
  try{return mergeGroups(indexed,deterministicGroups(indexed));}
  catch(error){console.warn('Cached ranking dedup skipped',error.name);return eligible;}
}
function rankingResponse(row){
  const {_pool,...payload}=row.payload||{},items=rankingItems(row.payload||{}).map(({scoringReasons,scoringEvidence,reports,summaryEvidence,summaryInputKey,...item})=>item);
  return {...payload,items,sourceStatus:(payload.sourceStatus||[]).filter(s=>!/jin10|金十|eastmoney|东方财富/i.test((s.spider||'')+' '+(s.label||''))),refreshedAt:row.source_refreshed_at,rankedAt:row.generated_at,
    stale:Date.now()-Date.parse(row.source_refreshed_at)>65*60*1000,
    pipeline:{...payload.pipeline,mode:'BACKGROUND_RANKING',displayed:items.length,rankingCandidates:[...(payload.items||[]),...(_pool||[])].length,policyVersion:POLICY,policyRefreshPending:payload.policyVersion!==POLICY||payload.pipeline?.modelStats?.pending>0,excludedAtRead:(payload.items||[]).length-items.length,domesticDisplayed:items.filter(x=>x.scope==='domestic').length,internationalDisplayed:items.filter(x=>x.scope==='international').length,primaryDisplayed:items.filter(x=>x.grade==='A类信源').length},ai:{...payload.ai,qualityStatus:payload.ai?.status,status:'PRECOMPUTED'}};
}
module.exports={readRanking,claimJob,readCheckpoints,saveProgress,publishRanking,finishJob,rankingResponse,rankingItems};

