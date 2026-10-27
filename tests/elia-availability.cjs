'use strict';
const assert=require('node:assert/strict'),E=require('../functions/elia-semantic'),P=require('../functions/elia-provider'),{fixture,database}=require('./fixtures/semantic-support'),{wrap}=require('../functions/elia-requests');
(async()=>{
 const db=database(fixture());let calls=0;
 const r=await E.respond({db,record:{},message:'Show hats',inputs:{},request:async()=>{calls++;return {answer:JSON.stringify({contract:E.CONTRACT,phase:'plan',tools:[],answer:'Here is HAT 2.',productIds:['/product-hat-2']})};}});assert.equal(calls,1);assert.equal(r.products[0].name,'HAT 2');
 let time=0,attempts=0;await P.request(async()=>++attempts===1?{ok:false,status:429,headers:{get:()=> '15'},text:async()=>''}:{ok:true,json:async()=>({answer:'ok'})},{clock:()=>time,deadline:45000,sleep:async ms=>time+=ms});assert.equal(attempts,2);assert.equal(time,15250);
 const records=new Map(),copy=v=>v?structuredClone(v):null;const s={rate:async()=>{},fail:(code,m)=>{throw Object.assign(Error(m),{code});},db:{ref:k=>({once:async()=>({val:()=>copy(records.get(k))}),transaction:async fn=>{const v=fn(copy(records.get(k)));if(v===undefined)return {committed:false};records.set(k,v);return {committed:true};},update:async v=>records.set(k,{...records.get(k),...v})})}};
 let invoked=0;const api=wrap(async()=>{if(++invoked===1)throw Object.assign(Error('busy'),{code:'resource-exhausted',safeToRetry:true,retryAfterMs:15000});return {answer:'Success'};},s,()=>false),q={message:'Show hats',requestId:'f'.repeat(64)},ctx={auth:{uid:'alice'},rawRequest:{ip:'test'}};
 assert.equal((await api(q,ctx)).requestStatus,'retryable');assert.equal((await api(q,ctx)).requestStatus,'retryable');assert.equal(invoked,1);
 await assert.rejects(api({...q,message:'Different'},ctx));await assert.rejects(api(q,{...ctx,auth:{uid:'bob'}}));
 for(const v of records.values())v.retryAt=Date.now()-1;
 assert.equal((await api({operation:'status',requestId:q.requestId},ctx)).requestStatus,'retryable');assert.equal(invoked,1);
 const results=await Promise.all([api(q,ctx),api(q,ctx)]);assert(results.some(r=>r.answer==='Success'));assert.equal(invoked,2);assert.equal((await api(q,ctx)).answer,'Success');assert.equal(invoked,2);
 const {boot,all,storage}=require('./elia-ui-harness');storage.clear();const ui=boot('retry-customer');ui.find('Ask Elia').click();ui.find('Start chatting').click();ui.reply(async()=>({requestStatus:'retryable',retryAt:Date.now()+15000,answer:'Wait 15 seconds, then Retry.'}));ui.input().value='Show hats';await ui.form().onsubmit({preventDefault(){}});const original=ui.calls[0].d.requestId;let uiCalls=0;ui.reply(async()=>++uiCalls===1?{requestStatus:'retryable',retryAt:Date.now()-60000}:{answer:'Available hats',catalogueVerified:true,products:[]});await ui.find('Retry').click();assert.equal(ui.calls.at(-1).d.requestId,original);assert.equal(ui.calls.at(-1).d.message,'Show hats');assert.equal(all(ui.body).filter(n=>n.className==='elia-bubble elia-user').length,1);
 console.log('PASS one-call verified products, 15-second provider retry, retryable receipt cooldown, identity/text binding, concurrent retry and successful replay');
})().catch(e=>{console.error(e);process.exitCode=1});
