const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const P=require('../api/_news-policy');
const {prepareModelItem,VERIFIED_LABELS}=require('../api/market-hotspots')._test;
const {rankingResponse}=require('../api/_rank-store');
const {aggregate,timeScore}=require('../api/_model-news');
const {currentProfile}=require('../api/_supabase');
const job=require('../api/internal/hotspot-refresh');
const {parseFeed}=require('../api/_official-news');
const at=Date.parse('2026-10-23T09:00:00+08:00');
const daytime=P.collectionWindow(new Date(at).toISOString(),{collectionWindow:{tradingDate:'2026-10-23'}},at);
const story=(overrides={})=>({id:'x',title:'国家统计局发布工业生产数据',summary:'工业增加值和产量公布新的数据',source:'国家统计局',spider:'stats_official',sourceUrl:'https://www.stats.gov.cn/sj/zxfb/202610/t20261023_1234.html',publishedAt:'2026-10-23T08:30:00+08:00',scope:'domestic',category:'宏观',grade:'A类信源',sources:[{name:'国家统计局',url:'https://www.stats.gov.cn/sj/zxfb/202610/t20261023_1234.html'}],scoring:{importance:30,timeliness:20,informationGain:15,futuresRelevance:20},score:85,...overrides});
test('official classification requires an actual official article URL, not the media name or hostname substring',()=>{
 assert.equal(P.sourceGrade(story().sourceUrl),'A类信源');assert.equal(P.sourceGrade('https://www.stats.gov.cn.evil.example/a'),'B类·已核验');assert.equal(P.sourceGrade('https://finance.sina.com.cn/article/123'),'B类·已核验');
 for(const url of ['', 'javascript:alert(1)','https://www.stats.gov.cn/','https://news.example.com/search?q=coal','http://127.0.0.1/article'])assert.equal(P.articleLink(url),'');
});
test('Jin10 and missing article links are removed before model calls and from cached rankings',()=>{
 assert.equal(VERIFIED_LABELS.jin10_flash_news,undefined);
 assert.equal(prepareModelItem({source:'jin10_flash_news',item:{title:'央行降准',url:'https://flash.jin10.com/detail/12345678901'}},1),null);
 assert.equal(prepareModelItem({source:'sina_finance_news',item:{title:'央行公布新政策',content:'新事实但没有链接'}},1),null);
 assert.equal(P.eligibleItem(story({sources:[{name:'财联社',url:''}],sourceUrl:''}),daytime),null);
 assert.equal(P.eligibleItem(story({source:'金十数据'}),daytime),null);
 const misleading=P.eligibleItem(story({source:'新浪财经',sourceUrl:'https://finance.sina.com.cn/article/1',sources:[{name:'新浪财经',url:'https://finance.sina.com.cn/article/1',grade:'A类信源'}]}),daytime);
 assert.equal(misleading.grade,'B类·已核验');
});
test('media digests are excluded without excluding individual official announcements',()=>{
 for(const title of ['华尔街见闻早餐','金十数据整理：今日重要数据','财联社早报：全球市场要闻','隔夜财经快讯汇总'])assert.equal(P.isRoundup(title),true,title);
 assert.equal(P.isRoundup('国家统计局公布9月工业生产数据'),false);
});
test('only first daily collection includes overnight reports, respecting close boundary and weekends',()=>{
 const first=P.collectionWindow(new Date(at).toISOString(),null,at);
 assert.equal(first.start,'2026-10-22T07:00:00.000Z');
 assert.equal(P.inWindow('2026-10-22T16:00:00+08:00',first),true);assert.equal(P.inWindow('2026-10-22T14:59:00+08:00',first),false);
 const later=P.collectionWindow('2026-10-23T09:30:00+08:00',{collectionWindow:first},at+1800000);
 assert.equal(later.firstOfDay,false);assert.equal(P.inWindow('2026-10-22T23:59:00+08:00',later),false);
 assert.equal(P.inWindow('2026-10-23T08:00:00+08:00',later),true);
 const monday=P.collectionWindow('2026-10-26T09:00:00+08:00',null,Date.parse('2026-10-26T09:00:00+08:00'));
 assert.equal(monday.start,'2026-10-23T07:00:00.000Z');
 assert.equal(P.inWindow('2026-10-22T16:00:00+08:00',P.displayWindow(first,at+36*60000)),false);
});
test('old cached rankings cannot bypass new source, date and roundup admission',()=>{
 const rows=[story(),story({id:'old',publishedAt:'2026-10-22T22:00:00+08:00'}),story({id:'roundup',title:'华尔街见闻早餐'}),story({id:'missing',sourceUrl:'',sources:[{name:'unknown',url:''}]})];
 const now=Date.now;Date.now=()=>at;
 try{const result=rankingResponse({payload:{items:rows,_pool:[story()]},source_refreshed_at:new Date(at).toISOString()});assert.equal(result.items.length,1);assert.equal(result._pool,undefined);assert.equal(result.pipeline.excludedAtRead,3);assert.equal(result.pipeline.policyRefreshPending,true);}finally{Date.now=now;}
});
test('mixing selects primary and domestic facts and limits geopolitical concentration while preserving score order',()=>{
 const stories=Array.from({length:20},(_,i)=>story({id:'g'+i,title:'冲突进展'+i,theme:'geopolitics',category:'能源化工',scope:'international',source:'媒体',grade:'B类·已核验',score:100-i}));
 stories.push(...Array.from({length:10},(_,i)=>story({id:'d'+i,theme:'inventory',category:i%2?'农产品':'黑色',score:60-i})));
 const selected=P.selectBalanced(stories,20);assert.equal(selected.length,18);assert.ok(selected.filter(x=>x.theme==='geopolitics').length<=8);assert.ok(selected.some(x=>x.grade==='A类信源'));assert.ok(selected.every((x,i)=>i===0||selected[i-1].score>=x.score));
});
test('new scoring emphasizes concrete transmission and excludes weak geopolitical associations',()=>{
 const data=story({id:'good'}),weak=story({id:'weak',title:'普通外交会谈'});
 const row=(id,relevance,theme)=>({id,admit:true,importance:30,informationGain:15,futuresRelevance:relevance,theme,scope:'domestic',category:'宏观',eventKey:id,reasons:{importance:'政策事实',informationGain:'新增数据',futuresRelevance:'原文依据'},evidence:'数据'});
 const result=aggregate([data,weak],[{rows:new Map([['good',row('good',22,'policy')],['weak',row('weak',5,'geopolitics')]]),failures:[],provider:'test',model:'test'}]);
 assert.equal(result.items.length,1);assert.equal(result.stats.rejected,1);assert.equal(result.items[0].scoringWeights.futuresRelevance,25);assert.ok(timeScore(new Date().toISOString())<=20);assert.ok(result.items[0].score<=100);
});
test('viewer account can read but cannot call write endpoints; unverified tokens are never trusted',async()=>{
 const saved=global.fetch,keys=['SUPABASE_URL','SUPABASE_ANON_KEY'],before=keys.map(k=>process.env[k]);Object.assign(process.env,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test'});
 const token='header.'+Buffer.from(JSON.stringify({app_metadata:{access_mode:'viewer'}})).toString('base64url')+'.signature';
 global.fetch=async()=>({ok:true,json:async()=>[{auth_user_id:'test',email_prefix:'futures',role:'user'}]});
 try{assert.equal((await currentProfile({method:'GET',headers:{authorization:'Bearer '+token}})).profile.role,'viewer');await assert.rejects(currentProfile({method:'POST',headers:{authorization:'Bearer '+token}}),/READ_ONLY_ACCOUNT/);global.fetch=async()=>({ok:false,json:async()=>[]});await assert.rejects(currentProfile({method:'GET',headers:{authorization:'Bearer '+token}}),/UNAUTHORIZED/);}finally{global.fetch=saved;keys.forEach((k,i)=>before[i]===undefined?delete process.env[k]:process.env[k]=before[i]);}
});
test('official RSS and Chinese official listing parser preserve real article identities and publication dates',()=>{
 const rss='<rss><item><title>New inventory data</title><link>https://www.eia.gov/todayinenergy/detail.php?id=123</link><pubDate>Fri, 23 Oct 2026 09:00:00 GMT</pubDate><description>New facts</description></item></rss>';
 assert.equal(parseFeed(rss,{kind:'rss',url:'https://www.eia.gov/rss/todayinenergy.xml'})[0].publishedAt,'2026-10-23T09:00:00.000Z');
 assert.equal(parseFeed('<a href="./202610/t20261023_123.html">国家统计局公布工业数据</a>',{kind:'html',url:'https://www.stats.gov.cn/sj/zxfb/'})[0].url,'https://www.stats.gov.cn/sj/zxfb/202610/t20261023_123.html');
});
test('all inline browser scripts remain syntactically valid',()=>{const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim())new vm.Script(match[1]);}});
