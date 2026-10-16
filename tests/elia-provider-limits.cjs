'use strict';
const assert=require('node:assert/strict'),P=require('../functions/elia-provider');
const wrapped='PluginInvokeError: API request failed with status code 429: {"error":{"message":"Rate limit reached. Please try again in 6.06s.","code":"rate_limit_exceeded"}}';
(async()=>{
 assert.deepEqual(P.classify(400,wrapped),{limited:true,retryMs:6310});
 assert.equal(P.classify(400,'invalid_param').limited,false);
 assert.equal(P.classify(500,'internal error').limited,false);
 let calls=0,waits=[],time=0;const opts={deadline:45000,clock:()=>time,sleep:async ms=>{waits.push(ms);time+=ms;}};
 const response=(status,body)=>({ok:false,status,text:async()=>body});
 const result=await P.request(async()=>++calls===1?response(400,wrapped):{ok:true,json:async()=>({answer:'ok'})},opts);
 assert.equal(result.answer,'ok');assert.equal(calls,2);assert.deepEqual(waits,[6310]);
 calls=0;await assert.rejects(P.request(async()=>{calls++;return response(400,wrapped);},opts),e=>e.code==='resource-exhausted');assert.equal(calls,2);
 for(const [status,body] of [[400,'bad input'],[500,'internal'],[429,''],[400,wrapped.replace('6.06','90')]]){
  calls=0;await assert.rejects(P.request(async()=>{calls++;return response(status,body);},opts));assert.equal(calls,1);
 }
 calls=0;await assert.rejects(P.request(async()=>{calls++;throw Error('network timeout');},opts));assert.equal(calls,1);
 calls=0;await assert.rejects(P.request(async()=>{calls++;return response(400,wrapped);},{...opts,deadline:time+7000}));assert.equal(calls,1);
 assert.equal(P.classify(429,'','12').retryMs,12250);
 // Exercise the actual callable with a wrapped rejection (no delay supplied).
 const {fixture,database}=require('./fixtures/semantic-support');
 require('../functions/elia-engine.json').mode='semantic-v1';
 Object.assign(process.env,{ELIA_ENABLED:'true',DIFY_APP_MODE:'advanced-chat',DIFY_ELIA_API_KEY:'mock'});
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const db=database(fixture()),api=require('../functions/elia-proxy').install({https:{HttpsError},runWith:()=>({https:{onCall:f=>f}})},{db,rate:async()=>{},fail:(code,message)=>{throw new HttpsError(code,message);}});
 const savedFetch=global.fetch;calls=0;
 global.fetch=async()=>{calls++;return response(400,wrapped.replace('Please try again in 6.06s.',''));};
 try{await assert.rejects(api({message:'Hello'},{auth:{uid:'alice'},rawRequest:{ip:'127.0.0.1'}}),e=>e.code==='resource-exhausted'&&!e.message.includes('PluginInvokeError'));assert.equal(calls,1);}finally{global.fetch=savedFetch;}
 console.log('PASS wrapped rate limits, bounded retry, delay, deadline, no timeout or unknown-error retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
