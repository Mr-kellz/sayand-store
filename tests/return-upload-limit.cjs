'use strict';
const assert=require('node:assert/strict'),{hash,install}=require('../functions/store-services'),limit=require('../functions/return-upload-limit');
const data=new Map();const clone=v=>v?structuredClone(v):null;
const db={ref:path=>({once:async()=>({val:()=>clone(data.get(path))}),transaction:async fn=>{const next=fn(clone(data.get(path)));if(next===undefined)return {committed:false};data.set(path,next);return {committed:true};}})};
class HttpsError extends Error{constructor(code,m){super(m);this.code=code;}}
const functions={https:{HttpsError},runWith:()=>({https:{onCall:f=>f,onRequest:f=>f}})};
const service=install(functions,{database:()=>db},async()=>{});const key=k=>'_serviceLimits/'+hash(k),now=Date.now();
(async()=>{
 data.set(key('return-upload:alice'),{count:12,until:now+100000});
 assert.equal(await limit.retryAt(db,'alice'),now+100000);
 await assert.rejects(limit.consume(db,'alice',service.rate,service.fail),e=>e.code==='resource-exhausted'&&e.message.includes(new Date(now+100000).toISOString()));assert.equal(data.get(key('return-upload:alice')).count,12);
 assert.equal(await limit.retryAt(db,'bob'),null);
 data.set(key('return-upload-global'),{count:200,until:now+200000});await assert.rejects(limit.consume(db,'bob',service.rate,service.fail));assert(!data.has(key('return-upload:bob')));
 data.clear();const results=await Promise.allSettled(Array.from({length:20},()=>limit.consume(db,'alice',service.rate,service.fail)));assert.equal(results.filter(r=>r.status==='fulfilled').length,12);assert.equal(data.get(key('return-upload:alice')).count,12);assert.equal(data.get(key('return-upload-global')).count,12);
 data.set(key('return-upload:alice'),{count:12,until:now-1});await limit.consume(db,'alice',service.rate,service.fail);assert.equal(data.get(key('return-upload:alice')).count,1);
 console.log('PASS exact retry time, existing counters retained, user isolation, global preflight, actual atomic limiter under concurrent requests, automatic recovery after expiry');
})().catch(e=>{console.error(e);process.exitCode=1;});
