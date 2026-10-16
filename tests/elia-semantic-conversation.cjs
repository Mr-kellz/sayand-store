'use strict';
const assert=require('node:assert/strict'),E=require('../functions/elia-semantic'),{fixture,database}=require('./fixtures/semantic-support');
require('../functions/elia-engine.json').mode='semantic-v1';
const {install}=require('../functions/elia-proxy');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
(async()=>{
 const store=fixture(),db=database(store),context={auth:{uid:'alice'},rawRequest:{ip:'127.0.0.1'}};
 const api=install({https:{HttpsError},runWith:o=>{assert(o.enforceAppCheck);return {https:{onCall:f=>f}};}},{db,rate:async()=>{},fail:(c,m)=>{throw new HttpsError(c,m);}});
 Object.assign(process.env,{ELIA_ENABLED:'true',DIFY_APP_MODE:'advanced-chat',DIFY_ELIA_API_KEY:'test-only'});
 let token,calls=[],planned=[],prose='The active offer starts at €15.',ids=[],bad=false,network=false;
 global.fetch=async(url,options)=>{if(network)throw Error('Network');const body=JSON.parse(options.body),ctx=JSON.parse(body.inputs.sayand_context);calls.push({body,ctx});assert.equal(body.conversation_id,'');assert(!body.user.includes('alice'));return {ok:true,json:async()=>({answer:bad?'invalid':JSON.stringify(ctx.phase==='plan'?{contract:E.CONTRACT,phase:'plan',tools:planned}:{contract:E.CONTRACT,phase:'answer',answer:prose,productIds:ids}),conversation_id:'isolated-provider-run'})};};
 const ask=async(message,requestId)=>{const r=await api({message,conversationToken:token,requestId},context);if(r.conversationToken)token=r.conversationToken;return r;};
 await ask('Any active promo?');
 planned=[{name:'promotion_eligibility',subtotal:'16'}];prose='Yes, €16 meets the current €15 minimum. Checkout checks final eligibility.';
 await ask('Can 16 euro pass checkout?');assert.equal(calls.at(-1).ctx.history[0].answer,'The active offer starts at €15.');
 planned=[{name:'promotion_eligibility',subtotal:'14.9'}];prose='No, €14.90 is €0.10 short of the €15 minimum.';
 let r=await ask('What if I have 14.9','a'.repeat(64));assert.equal(r.answer,prose);assert.equal(calls.at(-1).ctx.toolResults[0].shortfall,'0.10');assert.equal(calls.at(-1).body.query,'What if I have 14.9');assert.equal(calls.at(-1).ctx.history.at(-1).question,'Can 16 euro pass checkout?');
 const before=calls.length;await ask('What if I have 14.9','a'.repeat(64));assert.equal(calls.length,before,'Retry receipt does not call provider again');
 // Topic interpretation is mocked here. Verify transport/history, not model intelligence.
 planned=[];prose='You’re welcome.';await ask('Thanks');
 planned=[{name:'promotion_eligibility',subtotal:'14.9'}];prose='You still need €0.10 more.';await ask('I’m talking about the on going promo');assert(calls.at(-1).ctx.history.some(t=>t.question==='What if I have 14.9'));
 store.mainStore.announcement.promoMinAmount=20;await ask('How much more?');assert.equal(calls.at(-1).ctx.toolResults[0].shortfall,'5.10');
 planned=[];prose='This hat is reduced.';ids=['/product-hat-2'];r=await ask('Show me hats');assert.equal(r.products[0].price,25);
 prose='It is available in Green.';ids=[];await ask('What colour does that one come in?');assert.equal(calls.at(-1).ctx.history.at(-1).products[0].name,'HAT 2');
 const n=calls.length;await ask('Show my order address');assert.equal(calls.length,n);await assert.rejects(api({message:'Hello',conversationToken:token},{...context,auth:{uid:'bob'}}),e=>e.code==='permission-denied');assert.equal(calls.length,n);
 await assert.rejects(ask('Email me at a@example.test'),e=>e.code==='invalid-argument');
 const status=await api({requestId:'a'.repeat(64),operation:'status'},context);assert.equal(status.requestStatus,'done');assert.equal(calls.length,n);
 const saved=token;token=null;await ask('Hello');assert.equal(calls.at(-1).ctx.history.length,0);token=saved;
 bad=true;await assert.rejects(ask('Hello again'),e=>e.code==='unavailable');bad=false;network=true;await assert.rejects(ask('Hello again'),e=>e.code==='unavailable');network=false;
 const rec=Object.values(store._eliaConversations).find(x=>x.publicTurns?.length>2);assert(!JSON.stringify(rec).includes('Show my order address'));assert.equal(rec.busyUntil,null);
 // Same-tab continuation is server token based, independent of provider IDs.
 prose='Still here.';await ask('Back again');assert(calls.at(-1).ctx.history.some(t=>t.question==='What if I have 14.9'));
 assert(!JSON.stringify(calls).includes('test-only'));
 console.log('PASS actual semantic proxy: authoritative visible transcript, fresh facts, two phases, decimal tools, card validation, receipt replay/status, ownership, private guard, new chat, failure lock cleanup. Model responses mocked; semantic quality is a separate live gate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
