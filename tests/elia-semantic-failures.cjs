'use strict';
const assert=require('node:assert/strict'),E=require('../functions/elia-semantic'),{fixture,database}=require('./fixtures/semantic-support');
(async()=>{
 const store=fixture(),db=database(store),record={publicTurns:[{question:'An earlier topic',answer:'An earlier visible answer',products:[]}]};
 for(const failure of ['old-contract','bad-product','changed-price','expired-offer']){
  let calls=0;store.mainStore.newArrivals[1].salePrice=25;store.mainStore.announcement.promoEndDate=new Date(Date.now()+60000).toISOString();
  await assert.rejects(E.respond({db,record,message:'Continue',inputs:{},request:async(inputs,phase)=>{
   calls++;if(failure==='old-contract')return {answer:'Legacy free text'};
   if(phase==='plan')return {answer:JSON.stringify({contract:E.CONTRACT,phase,tools:[]})};
   if(failure==='changed-price')store.mainStore.newArrivals[1].salePrice=20;
   if(failure==='expired-offer')store.mainStore.announcement.promoEndDate=new Date(Date.now()-1).toISOString();
   return {answer:JSON.stringify({contract:E.CONTRACT,phase,answer:'A response',productIds:[failure==='bad-product'?'invented':'/product-hat-2']})};
  }}));assert(calls<=2);
 }
 const many={publicTurns:Array.from({length:80},(_,i)=>({question:'Question '+i,answer:'x'.repeat(6000),products:[]}))};const h=E.history(many);assert(h.length<=24);assert(JSON.stringify(h).length<=32000);assert.equal(h.at(-1).question,'Question 79');
 require('../functions/elia-engine.json').mode='semantic-v1';const {install}=require('../functions/elia-proxy');
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 Object.assign(process.env,{ELIA_ENABLED:'true',DIFY_APP_MODE:'advanced-chat',DIFY_ELIA_API_KEY:'mock'});
 const c={auth:{uid:'alice'},rawRequest:{ip:'127.0.0.1'}},api=install({https:{HttpsError},runWith:()=>({https:{onCall:f=>f}})},{db,rate:async()=>{},fail:(c,m)=>{throw new HttpsError(c,m);}});
 store.mainStore.announcement.promoEndDate=new Date(Date.now()+60000).toISOString();
 let calls=0,release,started;const barrier=new Promise(r=>started=r);global.fetch=async(u,i)=>{calls++;const phase=JSON.parse(JSON.parse(i.body).inputs.sayand_context).phase;if(calls===1){started();await new Promise(r=>release=r);}return {ok:true,json:async()=>({answer:JSON.stringify(phase==='plan'?{contract:E.CONTRACT,phase,tools:[]}:{contract:E.CONTRACT,phase,answer:'Hello',productIds:[]})})};};
 const token='c'.repeat(64),{hash}=require('../functions/store-services');await db.ref('_eliaConversations/'+hash(token)).set({owner:'alice',providerUser:'random-public-id',expires:Date.now()+100000});
 const pending=api({message:'Hello',conversationToken:token},c);await barrier;await assert.rejects(api({message:'Another',conversationToken:token},c),e=>e.code==='resource-exhausted');release();await pending;assert.equal(calls,2);
 global.fetch=async()=>({ok:false,status:429});await assert.rejects(api({message:'Hello',conversationToken:token},c),e=>e.code==='resource-exhausted');
 console.log('PASS semantic fail-closed contract, unverified IDs, mid-response CMS changes, bounded history, actual concurrent-send lock and upstream 429 handling');
})().catch(e=>{console.error(e);process.exitCode=1;});
