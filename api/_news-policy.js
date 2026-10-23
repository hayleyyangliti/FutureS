const POLICY='futures-news-v5-links-primary-current-day';
const DAY=86400000,ZONE=8*3600000;
const DISABLED=/金十|jin10|eastmoney|东方财富/i;
const OFFICIAL_HOSTS=['pbc.gov.cn','stats.gov.cn','ndrc.gov.cn','customs.gov.cn','mof.gov.cn','mofcom.gov.cn','moa.gov.cn','nea.gov.cn','csrc.gov.cn','shfe.com.cn','dce.com.cn','czce.com.cn','cffex.com.cn','gfex.com.cn','ine.cn','federalreserve.gov','eia.gov','bls.gov','bea.gov','usda.gov','ecb.europa.eu','boj.or.jp','imf.org','oecd.org'];
function articleLink(value){
  try{const u=new URL(value),p=u.pathname.replace(/\/+$/,'');
    if(!/^https?:$/.test(u.protocol)||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname))return '';
    if(/(?:^|\/)(?:search|tag|tags|category|channel|topics?)(?:\/|$)/i.test(p))return '';
    if(!p||/^\/(?:news|finance|stock|futures|live|flash|quick|latest|telegraph|roll|index(?:\.html?)?)$/i.test(p)){
      if(![...u.searchParams].some(([k,v])=>/^(id|article_id|newsid|docid)$/i.test(k)&&v.trim()))return '';
    }
    if(/\.(?:xml|rss)$/i.test(p))return '';
    return u.href;
  }catch(_){return '';}
}
function sourceGrade(url){try{const host=new URL(url).hostname.toLowerCase();return OFFICIAL_HOSTS.some(h=>host===h||host.endsWith('.'+h))&&articleLink(url)?'A类信源':'B类·已核验';}catch(_){return 'B类·已核验';}}
function isRoundup(title){return /华尔街见闻.{0,6}早餐|(?:金十|财联社|华尔街见闻|同花顺|格隆汇|新浪|第一财经|金融界).{0,8}(?:整理|汇总|早报|晚报|早餐)|(?:财经|市场|期货|商品|全球|隔夜|盘前|今日|昨日|每日|一周|本周).{0,8}(?:早报|晚报|早餐|要闻汇总|快讯汇总|新闻汇总|资讯汇总|一览|速览|复盘)|(?:早间|晚间|隔夜).{0,6}(?:要闻|必读)|(?:早报|晚报|早餐|快讯汇总|要闻汇总|新闻汇总|金十数据整理)/i.test(String(title||''));}
function chinaDate(ms=Date.now()){return new Date(ms+ZONE).toISOString().slice(0,10);}
function dayStart(ms=Date.now()){return Date.parse(chinaDate(ms)+'T00:00:00+08:00');}
function priorTradingDay(ms){let d=dayStart(ms)-DAY;const holidays=new Set((process.env.HOTSPOT_TRADING_HOLIDAYS||'').split(','));while([0,6].includes(new Date(d+ZONE).getUTCDay())||holidays.has(chinaDate(d)))d-=DAY;return d;}
function collectionWindow(version,previous=null,now=Date.now()){
  const at=now,date=chinaDate(at),old=previous?.payload?.collectionWindow||previous?.collectionWindow;
  if(old?.version===2&&old.tradingDate===date&&Date.parse(previous?.source_refreshed_at)===Date.parse(version)&&Date.parse(old.allowOvernightUntil)>now)return old;
  const previousDate=old?.tradingDate||(Number.isFinite(Date.parse(previous?.source_refreshed_at))?chinaDate(Date.parse(previous.source_refreshed_at)):null);
  const first=previousDate!==date;
  const close=/^\d{2}:\d{2}$/.test(process.env.HOTSPOT_MARKET_CLOSE||'')?process.env.HOTSPOT_MARKET_CLOSE:'15:00';
  const open=/^\d{2}:\d{2}$/.test(process.env.HOTSPOT_MARKET_OPEN||'')?process.env.HOTSPOT_MARKET_OPEN:'09:00';
  const start=first?Date.parse(chinaDate(priorTradingDay(at))+'T'+close+':00+08:00'):dayStart(at);
  const end=first?Math.min(at,Date.parse(date+'T'+open+':00+08:00')):at;
  return {version:2,tradingDate:date,firstOfDay:first,start:new Date(start).toISOString(),end:new Date(end).toISOString(),allowOvernightUntil:first?new Date(now+35*60000).toISOString():null};
}
function displayWindow(window,now=Date.now()){
  const overnight=window?.version===2&&window.firstOfDay&&window.tradingDate===chinaDate(now)&&Date.parse(window.allowOvernightUntil)>now;
  return {start:overnight?window.start:new Date(dayStart(now)).toISOString(),end:new Date(now).toISOString()};
}
function inWindow(value,window){const ms=Date.parse(value||'');return Number.isFinite(ms)&&ms>=Date.parse(window.start)&&ms<=Date.parse(window.end);}
function cleanSources(item){
  const input=item.sources?.length?item.sources:[{name:item.source,url:item.sourceUrl,title:item.title,publishedAt:item.publishedAt}];
  const seen=new Set();return input.filter(s=>s&&!DISABLED.test(s.name||'')&&!DISABLED.test(s.url||'')&&articleLink(s.url)&&!seen.has(s.name)&&seen.add(s.name)).map(s=>({...s,url:articleLink(s.url),grade:sourceGrade(s.url)})).sort((a,b)=>Number(b.grade==='A类信源')-Number(a.grade==='A类信源')).slice(0,3);
}
function eligibleItem(item,window){
  if(!item||DISABLED.test(item.spider||'')||DISABLED.test(item.source||'')||isRoundup(item.originalTitle||item.title)||!inWindow(item.publishedAt,window))return null;
  const sources=cleanSources(item);if(!sources.length)return null;
  return {...item,sources,sourceUrl:sources.find(s=>s.url===item.sourceUrl)?.url||sources[0].url,grade:sources.some(s=>s.grade==='A类信源')?'A类信源':'B类·已核验'};
}
function themeOf(item){if(item.theme)return item.theme;const text=String(item.title||'')+' '+String(item.summary||'');if(/战争|军事|袭击|停火|导弹|轰炸|战事|冲突|外交/.test(text))return 'geopolitics';if(/库存|储备/.test(text))return 'inventory';if(/通关|口岸|航运|运河|海峡|运费/.test(text))return 'logistics';if(/产量|停产|复产|减产|开工|进口|出口/.test(text))return 'supply';return 'other';}
function selectBalanced(input,limit=100){
  const ranked=[...input].sort((a,b)=>(b.score||0)-(a.score||0)||Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0));
  const size=Math.min(limit,ranked.length);if(!size)return [];
  const selected=new Set(),counts=new Map(),geoLimit=Math.max(1,Math.floor(size*.4)),categoryLimit=Math.max(1,Math.ceil(size*.4));let geo=0;
  const add=item=>{if(selected.has(item)||selected.size>=size)return;if(themeOf(item)==='geopolitics'&&geo>=geoLimit)return;if((counts.get(item.category)||0)>=categoryLimit)return;selected.add(item);counts.set(item.category,(counts.get(item.category)||0)+1);if(themeOf(item)==='geopolitics')geo++;};
  for(const scope of ['domestic','international'])ranked.filter(i=>i.scope===scope).slice(0,Math.floor(size*.3)).forEach(add);
  ranked.filter(i=>i.grade==='A类信源').slice(0,Math.max(1,Math.floor(size*.2))).forEach(add);
  for(const category of ['农产品','黑色','有色及贵金属','能源化工','宏观','资产配置','绿色金融及新能源','金融工程']){const candidate=ranked.find(i=>i.category===category&&themeOf(i)!=='geopolitics');if(candidate)add(candidate);}
  ranked.forEach(add);
  // Category diversity is a preference, not a reason to discard otherwise
  // eligible facts. The geopolitical concentration ceiling remains strict.
  for(const item of ranked){if(selected.size>=size)break;if(selected.has(item))continue;if(themeOf(item)==='geopolitics'){if(geo>=geoLimit)continue;geo++;}selected.add(item);}
  return ranked.filter(i=>selected.has(i));
}
function publishable(items,window,limit=100){return selectBalanced((items||[]).map(i=>eligibleItem(i,window)).filter(Boolean),limit);}
module.exports={POLICY,articleLink,sourceGrade,isRoundup,chinaDate,collectionWindow,displayWindow,inWindow,eligibleItem,selectBalanced,publishable,themeOf};
