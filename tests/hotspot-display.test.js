const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const html=fs.readFileSync(process.env.HOTSPOT_UI_FILE||path.join(__dirname,'../public/index.html'),'utf8');
test('legacy and model summary display never exceeds 200 Unicode characters',()=>{
 const source=html.slice(html.indexOf('  function hotspotSummaryText(item){'),html.indexOf('  function renderHotspotItems(items){'));
 const context=vm.createContext({});vm.runInContext(source+';globalThis.format=hotspotSummaryText;',context);
 for(const value of ['简短总结','长'.repeat(500),'🚢'.repeat(250),'核心事实。'.repeat(100)]){
  const result=context.format({summary:value});assert.ok(Array.from(result).length<=200);if(Array.from(value).length<=200)assert.equal(result,value);
 }
 assert.ok(html.includes('escapeHtml(hotspotSummaryText(item))'));
 assert.ok(html.includes('原文节选（等待总结更新）'));
});
test('missing article links retain source text rather than an empty source row',()=>{
 assert.ok(!html.includes('.source-item span:last-child{display:none}'));
 assert.ok(html.includes('.source-item > span:last-child:not(:first-child){display:none}'));
 const source=html.split('\n').find(line=>line.includes('const sourceLink=source=>'));
 const context=vm.createContext({escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),safeHotspotUrl:value=>/^https?:\/\//i.test(String(value||''))?value:'',hotspotTime:()=> '2026/10/21'});
 vm.runInContext(source+';globalThis.render=sourceLink;',context);
 const noLink=context.render({name:'金十数据',title:'每日全球外汇市场要闻速递',url:''});
 assert.ok(noLink.includes('金十数据'));assert.ok(noLink.includes('每日全球外汇市场要闻速递'));assert.ok(noLink.includes('原文链接缺失'));assert.ok(!noLink.includes('href='));
 const linked=context.render({name:'财联社',title:'标题',url:'https://www.cls.cn/detail/123'});assert.ok(linked.includes('href="https://www.cls.cn/detail/123"'));
 assert.ok(!context.render({url:'javascript:alert(1)',name:'<script>'}).includes('href='));
});
test('all inline scripts remain syntactically valid after minimal UI patch',()=>{
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));}
});
