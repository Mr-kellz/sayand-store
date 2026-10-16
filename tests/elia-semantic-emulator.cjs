'use strict';
const assert=require('node:assert/strict');
if(!/^127\.0\.0\.1:19020$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))throw Error('Use only the local database emulator on port 19020.');
for(const k of Object.keys(process.env))if(/proxy/i.test(k))delete process.env[k];
const admin=require('firebase-admin'),{getDatabase}=require('firebase-admin/database'),{fixture}=require('./fixtures/semantic-support');
const app=admin.initializeApp({projectId:'demo-sayand-update',databaseURL:'http://127.0.0.1:19020/?ns=demo-sayand-update-default-rtdb'}),db=getDatabase(app);
require('../functions/elia-engine.json').mode='semantic-v1';
const E=require('../functions/elia-semantic'),{install}=require('../functions/elia-proxy');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
(async()=>{
 await db.ref().set(fixture());Object.assign(process.env,{ELIA_ENABLED:'true',DIFY_APP_MODE:'advanced-chat',DIFY_ELIA_API_KEY:'mock-only'});
 let calls=0;global.fetch=async(u,i)=>{calls++;const ctx=JSON.parse(JSON.parse(i.body).inputs.sayand_context);return {ok:true,json:async()=>({answer:JSON.stringify(ctx.phase==='plan'?{contract:E.CONTRACT,phase:'plan',tools:[{name:'promotion_eligibility',subtotal:'14.90'}]}:{contract:E.CONTRACT,phase:'answer',answer:'No, €14.90 is €0.10 short.',productIds:[]})})};};
 const api=install({https:{HttpsError},runWith:()=>({https:{onCall:f=>f}})},{db,rate:async()=>{},fail:(c,m)=>{throw new HttpsError(c,m);}}),c={auth:{uid:'alice'},rawRequest:{ip:'127.0.0.1'}},requestId='e'.repeat(64);
 const r=await api({message:'What if I have 14.9',requestId},c);assert.equal(r.requestStatus,'done');assert.equal(calls,2);
 assert.equal((await api({message:'What if I have 14.9',requestId},c)).answer,r.answer);assert.equal(calls,2);
 await assert.rejects(api({message:'Hello',conversationToken:r.conversationToken},{...c,auth:{uid:'bob'}}),e=>e.code==='permission-denied');
 const rows=(await db.ref('_eliaConversations').once('value')).val();assert.equal(Object.values(rows)[0].publicTurns[0].answer,r.answer);assert(!Object.values(rows)[0].busyUntil);
 await db.ref('mainStore/announcement/promoMinAmount').set(20);const snap=await E.snapshot(db);assert.equal(E.calculate({tools:[{name:'promotion_eligibility',subtotal:'14.9'}]},snap)[0].shortfall,'5.10');
 console.log('PASS real Database emulator: semantic transcript persistence, receipt replay, owner isolation, lock cleanup and fresh CMS facts. Dify mocked; no live Firebase/customer data.');
})().then(()=>app.delete()).catch(async e=>{console.error(e);process.exitCode=1;await app.delete();});
