const {test}=require('node:test');
const assert=require('node:assert/strict');
const {rankingResponse}=require('../api/_rank-store');

function candidate(index){
  return {
    id:`event-${index}`,eventKey:`事件-${index}`,title:`国内产业资讯 ${index}`,
    summary:'这是一条具有明确产业供需影响和原文链接的可追溯资讯。',source:'测试信源',
    sourceUrl:`https://example.com/article/${index}`,publishedAt:'2026-10-25T18:00:00.000Z',
    sources:[{name:'测试信源',url:`https://example.com/article/${index}`,publishedAt:'2026-10-25T18:00:00.000Z'}],
    scope:index%2?'domestic':'international',category:index%3?'黑色':'宏观',theme:'supply',score:200-index,
  };
}

test('ranking response keeps the ranking collection window and refills Top 100 from the scored pool',()=>{
  const pool=Array.from({length:110},(_,index)=>candidate(index));
  const result=rankingResponse({source_refreshed_at:'2026-10-26T00:30:00.000Z',generated_at:'2026-10-26T00:35:00.000Z',payload:{
    policyVersion:'futures-news-v8-domestic-primary-coverage-top100',
    collectionWindow:{start:'2026-10-25T07:00:00.000Z',end:'2026-10-26T01:00:00.000Z'},
    items:pool.slice(0,8),_pool:pool,pipeline:{},ai:{status:'SCORED'},sourceStatus:[],
  }});
  assert.equal(result.items.length,100);
  assert.equal(result.items[0].id,'event-0');
  assert.equal(result.pipeline.rankingCandidates,118);
});
