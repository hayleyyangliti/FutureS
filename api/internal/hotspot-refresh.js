const crypto=require('node:crypto');
const {supabase,send}=require('../_supabase');
const {prepareModelItem,selectCoverage,VERIFIED_LABELS}=require('../market-hotspots')._test;
const {evaluateSnapshot}=require('../_model-news');
const {consolidateEvents}=require('../_event-consolidation');
const {readRanking,claimJob,publishRanking,finishJob}=require('../_rank-store');
function authorized(req){const key=process.env.HOTSPOT_JOB_SECRET,supplied=(req.headers.authorization||'').replace(/^Bearer /,'');return Boolean(key&&supplied&&Buffer.byteLength(key)===Buffer.byteLength(supplied)&&crypto.timingSafeEqual(Buffer.from(key),Buffer.from(supplied)));}
function eventIdentity(item){return crypto.createHash('sha256').update(JSON.stringify([item.sourceUrl||'',item.title,item.publishedAt])).digest('hex');}
function combinePool(current,previous){
  const cutoff=Date.now()-24*60*60*1000;
  const prior=(previous||[]).filter(item=>Number.isFinite(Date.parse(item.publishedAt))&&Date.parse(item.publishedAt)>=cutoff);
  const pool=[...new Map([...prior,...current].map(item=>[eventIdentity(item),item])).values()];
  return selectCoverage(pool.sort((a,b)=>b.score-a.score),200).map((item,index)=>({...item,id:`event-${index}`}));
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(!process.env.HOTSPOT_JOB_SECRET)return send(res,503,{error:'JOB_SECRET_NOT_CONFIGURED'});
  if(!authorized(req))return send(res,401,{error:'UNAUTHORIZED'});
  let key,token;
  try{
    const rows=await supabase('/rest/v1/omnidata_news_snapshots?id=eq.current&select=payload,updated_at&limit=1');
    const feed=rows?.[0]?.payload?.data,version=feed?.refreshedAt||rows?.[0]?.updated_at;
    if(!Array.isArray(feed?.items)||!Number.isFinite(Date.parse(version)))return send(res,503,{error:'RAW_SNAPSHOT_MISSING'});
    key=crypto.createHash('sha256').update('precompute-v1'+version).digest('hex');token=crypto.randomUUID();
    if(!await claimJob(key,token))return send(res,202,{status:'ALREADY_RUNNING_OR_COMPLETED'});
    const previous=await readRanking(),items=feed.items.filter(entry=>entry&&Object.hasOwn(VERIFIED_LABELS,entry.source)).map(prepareModelItem).filter(Boolean),analysis=await evaluateSnapshot(items);
    if(!items.length||analysis.stats.failed===items.length)throw Error('NO_VALID_MODEL_RESULTS');
    // Carry only previously model-approved recent events, never rejected flashes.
    const pool=combinePool(analysis._events,previous?.payload?._pool);
    const merged=await consolidateEvents(pool),selected=selectCoverage(merged);
    const payload={items:selected,_pool:pool,sourceStatus:(feed.sourceStatus||[]).map(row=>({spider:row.source,label:row.source,ok:Boolean(row.lastSuccessAt)&&!row.lastError,count:row.lastCount||0,checkedAt:row.lastAttemptAt,reason:row.lastError||undefined})),
      pipeline:{mode:'BACKGROUND_RANKING',raw:feed.items.length,collected:items.length,modelStats:{...analysis.stats,events:merged.length,displayed:selected.length},domesticDisplayed:selected.filter(x=>x.scope==='domestic').length,internationalDisplayed:selected.filter(x=>x.scope==='international').length},
      ai:{status:analysis.status,provider:analysis.provider,model:analysis.model,failures:analysis.failures}};
    const published=await publishRanking(payload,version);
    if(!published){await finishJob(key,token,'completed',{superseded:true});return send(res,200,{status:'SUPERSEDED'});}
    await finishJob(key,token,analysis.stats.failed?'partial':'completed',{stats:analysis.stats,events:merged.length,displayed:selected.length});
    return send(res,200,{status:'PUBLISHED',displayed:selected.length,failed:analysis.stats.failed});
  }catch(error){
    if(key&&token)await finishJob(key,token,'failed',{code:/^[A-Z_]+$/.test(error.message)?error.message:'JOB_FAILED'}).catch(()=>{});
    console.error('Background hotspot job failed',{name:error.name,code:error.code||null});
    return send(res,502,{error:'BACKGROUND_JOB_FAILED'});
  }
};
module.exports._test={authorized,combinePool,eventIdentity};
