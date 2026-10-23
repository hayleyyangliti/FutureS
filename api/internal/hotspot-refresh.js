const crypto=require('node:crypto');
const {supabase,send,currentProfile}=require('../_supabase');
const {prepareModelItem,selectCoverage,VERIFIED_LABELS}=require('../market-hotspots')._test;
const {evaluateResumable}=require('../_model-news');
const {consolidateEvents}=require('../_event-consolidation');
const {summarizeEvents}=require('../_news-summary');
const {readRanking,claimJob,readCheckpoints,saveProgress,publishRanking,finishJob}=require('../_rank-store');
const {POLICY,collectionWindow,eligibleItem,publishable}=require('../_news-policy');
const {collectOfficial}=require('../_official-news');
function authorized(req){const key=process.env.HOTSPOT_JOB_SECRET,supplied=(req.headers.authorization||'').replace(/^Bearer /,'');return Boolean(key&&supplied&&Buffer.byteLength(key)===Buffer.byteLength(supplied)&&crypto.timingSafeEqual(Buffer.from(key),Buffer.from(supplied)));}
function eventIdentity(item){return crypto.createHash('sha256').update(JSON.stringify([item.sourceUrl||'',item.title,item.publishedAt])).digest('hex');}
function combinePool(current,previous,window=collectionWindow(new Date().toISOString(),{collectionWindow:{tradingDate:new Date(Date.now()+8*3600000).toISOString().slice(0,10)}})){
  const valid=[...(previous||[]),...current].map(item=>eligibleItem(item,window)).filter(Boolean);
  const pool=[...new Map(valid.map(item=>[eventIdentity(item),item])).values()];
  return selectCoverage(pool.sort((a,b)=>b.score-a.score),200).map((item,index)=>({...item,id:`event-${index}`}));
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
  let permitted=authorized(req);
  if(!permitted){try{
    // A signed-in reader may refresh an obsolete computed cache, but cannot
    // author content or force a completed current-policy ranking to rerun.
    const {profile}=await currentProfile({...req,method:'GET'}),existing=await readRanking();
    const needsUpgrade=existing?.payload?.policyVersion!==POLICY||existing?.payload?.pipeline?.modelStats?.pending>0||existing?.payload?.pipeline?.modelStats?.summaryPending>0;
    permitted=profile.role==='developer'||needsUpgrade;
  }catch(_){}}
  if(!permitted)return send(res,401,{error:'UNAUTHORIZED'});
  let key,token,progress={};
  try{
    const rows=await supabase('/rest/v1/omnidata_news_snapshots?id=eq.current&select=payload,updated_at&limit=1');
    const feed=rows?.[0]?.payload?.data,version=feed?.refreshedAt||rows?.[0]?.updated_at;
    if(!Array.isArray(feed?.items)||!Number.isFinite(Date.parse(version)))return send(res,503,{error:'RAW_SNAPSHOT_MISSING'});
    key='model-v5-'+crypto.createHash('sha256').update(POLICY+version).digest('hex');token=crypto.randomUUID();
    if(!await claimJob(key,token))return send(res,202,{status:'ALREADY_RUNNING_OR_COMPLETED'});
    const previous=await readRanking(),window=collectionWindow(version,previous),official=await collectOfficial(window);
    const entries=[...feed.items,...official.items];
    const items=entries.filter(entry=>entry&&Object.hasOwn(VERIFIED_LABELS,entry.source)).map(prepareModelItem).filter(Boolean).map(item=>eligibleItem(item,window)).filter(Boolean);
    const {analysis,records}=await evaluateResumable(items,await readCheckpoints(),{budgetMs:125000});
    progress={evaluations:records,stats:analysis.stats,failures:analysis.failures};
    // Save validated decisions before consolidation, including model rejections.
    // A merge failure or a new raw snapshot must not cause all 500 to restart.
    await saveProgress(key,token,progress);
    if(items.length&&!analysis.stats.evaluated)throw Error('NO_VALID_MODEL_RESULTS');
    // Carry only previously model-approved recent events, never rejected flashes.
    const pool=combinePool(analysis._events,previous?.payload?.policyVersion===POLICY?previous?.payload?._pool:[],window);
    const merged=await consolidateEvents(pool),summaries=await summarizeEvents(selectCoverage(merged),previous?.payload?.items);
    const selected=publishable(summaries.items,window);
    progress.stats={...analysis.stats,summaryPending:summaries.pending};
    const payload={items:selected,_pool:pool,policyVersion:POLICY,collectionWindow:window,sourceStatus:[...(feed.sourceStatus||[]).filter(row=>Object.hasOwn(VERIFIED_LABELS,row.source)).map(row=>({spider:row.source,label:VERIFIED_LABELS[row.source],ok:Boolean(row.lastSuccessAt)&&!row.lastError,count:row.lastCount||0,checkedAt:row.lastAttemptAt,reason:row.lastError||undefined})),...official.statuses],
      pipeline:{mode:'BACKGROUND_RANKING',raw:entries.length,collected:items.length,excludedBySourceLinkTimeOrRoundup:entries.length-items.length,officialCollected:official.items.length,primaryDisplayed:selected.filter(x=>x.grade==='A类信源').length,modelStats:{...progress.stats,events:merged.length,displayed:selected.length},domesticDisplayed:selected.filter(x=>x.scope==='domestic').length,internationalDisplayed:selected.filter(x=>x.scope==='international').length},
      ai:{status:analysis.status,provider:analysis.provider,model:analysis.model,failures:analysis.failures}};
    const published=await publishRanking(payload,version);
    if(!published){await finishJob(key,token,'completed',{...progress,superseded:true});return send(res,200,{status:'SUPERSEDED'});}
    await finishJob(key,token,analysis.stats.pending||summaries.pending?'partial':'completed',{...progress,events:merged.length,displayed:selected.length});
    return send(res,200,{status:'PUBLISHED',displayed:selected.length,failed:analysis.stats.failed,pending:analysis.stats.pending,summaryPending:summaries.pending});
  }catch(error){
    if(key&&token)await finishJob(key,token,'failed',{...progress,code:/^[A-Z_]+$/.test(error.message)?error.message:'JOB_FAILED'}).catch(()=>{});
    console.error('Background hotspot job failed',{name:error.name,code:error.code||null});
    return send(res,502,{error:'BACKGROUND_JOB_FAILED'});
  }
};
module.exports._test={authorized,combinePool,eventIdentity};

