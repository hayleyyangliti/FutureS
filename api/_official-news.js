const {articleLink,sourceGrade,inWindow,chinaDate}=require('./_news-policy');
const FEEDS=[
 {source:'stats_official',label:'国家统计局',url:'https://www.stats.gov.cn/sj/zxfb/',kind:'html'},
 {source:'ndrc_official',label:'国家发展改革委',url:'https://www.ndrc.gov.cn/xwdt/xwfb/',kind:'html'},
 {source:'ndrc_official',label:'国家发展改革委',url:'https://www.ndrc.gov.cn/xwdt/tzgg/',kind:'html'},
 {source:'pbc_official',label:'中国人民银行',url:'https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html',kind:'html'},
 {source:'mof_official',label:'财政部',url:'https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/',kind:'html'},
 {source:'customs_official',label:'海关总署',url:'http://www.customs.gov.cn/customs/xwfb34/302425/index.html',kind:'html'},
 {source:'moa_official',label:'农业农村部',url:'https://www.moa.gov.cn/xw/',kind:'html'},
 {source:'shfe_official',label:'上期所',url:'https://www.shfe.com.cn/news/notice/',kind:'html'},
 {source:'dce_official',label:'大商所',url:'https://www.dce.com.cn/dalianshangpin/sszt/4782/index.html',kind:'html'},
 {source:'czce_official',label:'郑商所',url:'https://www.czce.com.cn/cn/sspz/H770307index_1.htm',kind:'html'},
 {source:'fed_official',label:'美联储',url:'https://www.federalreserve.gov/feeds/press_all.xml',kind:'rss'},
 {source:'eia_official',label:'美国能源信息署',url:'https://www.eia.gov/rss/press_rss.xml',kind:'rss'},
];
function plain(value){return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();}
function tag(block,name){return block.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'';}
function parseFeed(html,feed){
 if(feed.kind==='rss')return [...html.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([,block])=>({title:plain(tag(block,'title')),url:new URL(plain(tag(block,'link')),feed.url).href,publishedAt:new Date(plain(tag(block,'pubDate'))).toISOString(),summary:plain(tag(block,'description'))}));
 const rows=[];
 for(const [,href,label] of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const title=plain(label),date=href.match(/(?:t|\/)(20\d{2})(\d{2})(\d{2})(?:\d{6,12})?[_/]/);
  if(!date||title.length<6)continue;
  try{const url=new URL(href,feed.url),root=new URL(feed.url).hostname.replace(/^www\./,'');if((url.hostname!==root&&!url.hostname.endsWith('.'+root))||!articleLink(url.href))continue;if(url.protocol==='http:')url.protocol='https:';
   rows.push({title,url:url.href,publishedAt:`${date[1]}-${date[2]}-${date[3]}T00:00:00+08:00`,summary:'',publicationPrecision:'day'});
  }catch(_){}
 }
 return [...new Map(rows.map(row=>[row.url,row])).values()];
}
function articleBody(html){
 const quoted=html.search(/<div\b[^>]*(?:class|id)=["'][^"']*(?:TRS_Editor|viewTRS|article-content|articleContent|content-article|contentbox|my_doccontent|my_conboxzw|zoom)[^"']*["']/i);
 const start=quoted>=0?quoted:html.search(/<div\b[^>]*(?:class|id)=TRS_Editor\b/i);
 if(start>=0){const rest=html.slice(start);let depth=0;for(const match of rest.matchAll(/<\/?div\b[^>]*>/gi)){depth+=/^<\//.test(match[0])?-1:1;if(depth===0)return plain(rest.slice(0,match.index+match[0].length)).slice(0,6000);}}
 return plain(html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]||'').slice(0,6000);
}
async function getText(url,deadline){const timeout=Math.min(10000,deadline-Date.now());if(timeout<500)throw Error('DEADLINE');const r=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'FutureS/1.0 (public financial news reader)','Accept':'text/html,application/rss+xml,application/xml;q=0.9'}});if(!r.ok)throw Error('HTTP_'+r.status);return await r.text();}
async function collectOfficial(window,options={}){
 const deadline=Date.now()+(options.budgetMs??22000),items=[],statuses=[];
 await Promise.all(FEEDS.map(async feed=>{
  try{const candidates=parseFeed(await getText(feed.url,deadline),feed).filter(row=>inWindow(row.publishedAt,window)).slice(0,5);let count=0;
   await Promise.all(candidates.map(async row=>{try{
    const html=await getText(row.url,deadline);if(sourceGrade(row.url)!=='A类信源')return;
    const metaDate=html.match(/<meta\s+[^>]*(?:name|property)=["'](?:PubDate|pubdate|publishdate|publish_date|article:published_time)["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if(metaDate){const value=metaDate.trim().replace(/\//g,'-'),date=new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)&&!/[Zz]|[+-]\d\d:?\d\d$/.test(value)?value.replace(' ','T')+'+08:00':value);if(Number.isFinite(date.getTime()))row.publishedAt=date.toISOString();}
    if(!inWindow(row.publishedAt,window))return;
    const body=articleBody(html),summary=body.length>row.summary.length?body:row.summary;
    if(!summary)return;
    items.push({source:feed.source,item:{title:row.title,content:summary,url:row.url,publishedAt:row.publishedAt,publicationPrecision:row.publicationPrecision}});count++;
   }catch(_){}}));
   statuses.push({spider:feed.source,label:feed.label,ok:true,count,checkedAt:new Date().toISOString(),reason:count?undefined:'NO_CURRENT_WINDOW_RELEASES'});
  }catch(error){statuses.push({spider:feed.source,label:feed.label,ok:false,count:0,checkedAt:new Date().toISOString(),reason:/^HTTP_\d+$/.test(error.message)?error.message:'OFFICIAL_FETCH_FAILED'});}
 }));
 const grouped=new Map();for(const row of statuses){const old=grouped.get(row.spider);if(!old){grouped.set(row.spider,row);continue;}grouped.set(row.spider,{...row,ok:row.ok||old.ok,count:row.count+old.count,reason:row.count+old.count?undefined:(row.ok||old.ok?'NO_CURRENT_WINDOW_RELEASES':row.reason)});}
 return {items:[...new Map(items.map(item=>[item.item.url,item])).values()],statuses:[...grouped.values()]};
}
module.exports={collectOfficial,parseFeed,plain,articleBody,FEEDS};
