'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {install}=require('../functions/return-service');
const id='-'+'2'.repeat(19),second='-'+'3'.repeat(19),copy=v=>v===undefined?null:structuredClone(v);
const store={orders:{[id]:{userId:'owner',status:'Return Requested',returnCase:{status:'Under review',messages:{}}},[second]:{userId:'owner',status:'Return Requested',returnCase:{status:'Under review',messages:{}}}}};
let coldCalls=0,concurrentClose=false,removeCase=false,saves=0;const objects=new Map();
const db={ref(p){const parts=p.split('/');const get=()=>parts.reduce((v,k)=>v?.[k],store);const set=v=>{let o=store;for(const k of parts.slice(0,-1))o=o[k]??={};if(v===null)delete o[parts.at(-1)];else o[parts.at(-1)]=copy(v);};return {once:async()=>({val:()=>copy(get())}),child:k=>db.ref(p+'/'+k),remove:async()=>set(null),transaction:async fn=>{
 // Reproduce SDK cold-cache behavior: undefined aborts before seeing server data.
 coldCalls++;const initial=fn(null);if(initial===undefined)return {committed:false,snapshot:{val:()=>null}};
 if(removeCase){set(null);removeCase=false;}
 const current=copy(get()),next=current===null?initial:fn(current);if(next===undefined)return {committed:false,snapshot:{val:()=>copy(get())}};set(next);return {committed:true,snapshot:{val:()=>copy(get())}};
 }};}};
const fail=(code,m)=>{throw Object.assign(Error(m),{code});};
const storage={storage:()=>({bucket:()=>({file:p=>({save:async bytes=>{saves++;objects.set(p,bytes);if(concurrentClose)store.orders[id].returnCase.status='Declined';},delete:async()=>objects.delete(p),getSignedUrl:async()=>['https://example.test/authorized-download']})})})};
const api=install(storage,{db,call:f=>f,uid:c=>c.auth?.uid||fail('unauthenticated','Sign in'),rate:async()=>{},fail,ADMIN:'admin'}),owner={auth:{uid:'owner'}},admin={auth:{uid:'admin'}};
const file=(n=1,orderId=id)=>({orderId,mime:'image/jpeg',name:'photo-'+n+'.jpg',base64:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(40,n)]).toString('base64')});
(async()=>{
 const uploaded=await api.attachReturnEvidence(file(),owner);assert(uploaded.success);assert.equal(saves,1);assert(coldCalls>=2);assert.equal(store.orders[id].returnCase.attachments[uploaded.attachmentId].status,'ready');assert.equal((await api.attachReturnEvidence(file(),owner)).alreadySaved,true);assert.equal(saves,1);
 for(const c of [owner,admin]){assert((await api.getOrderReturn({orderId:id},c)).case.attachments[uploaded.attachmentId]);assert((await api.viewReturnEvidence({orderId:id,attachmentId:uploaded.attachmentId},c)).url);}
 for(let i=2;i<=6;i++)await api.attachReturnEvidence(file(i),owner);const count=saves;await assert.rejects(api.attachReturnEvidence(file(7),owner),e=>e.code==='failed-precondition'&&/six files/.test(e.message));assert.equal(saves,count);
 await api.attachReturnEvidence(file(7,second),owner);assert.equal(saves,count+1,'A separate open case has its own six-file limit');
 await assert.rejects(api.attachReturnEvidence(file(8,second),{auth:{uid:'stranger'}}),e=>e.code==='permission-denied');
 await api.reviewOrderReturn({orderId:second,decision:'Declined',message:'The request has been declined after review.'},admin);assert.equal(store.orders[second].status,'Return Declined');assert.equal(store.orders[second].returnCase.status,'Declined');assert.equal((await api.getOrderReturn({orderId:second},owner)).isClosed,true);await assert.rejects(api.attachReturnEvidence(file(8,second),owner),e=>/closed/.test(e.message));assert((await api.viewReturnEvidence({orderId:second,attachmentId:Object.keys(store.orders[second].returnCase.attachments)[0]},owner)).url);
 store.orders[id].returnCase={status:'Under review',messages:{}};concurrentClose=true;await assert.rejects(api.attachReturnEvidence(file(9),owner),e=>e.code==='failed-precondition');assert.equal(Object.keys(store.orders[id].returnCase.attachments||{}).length,0);concurrentClose=false;
 store.orders[id].returnCase={status:'Under review',messages:{}};removeCase=true;const before=saves;await assert.rejects(api.attachReturnEvidence(file(10),owner),e=>/no longer available/.test(e.message));assert.equal(saves,before);assert(!store.orders[id].returnCase,'Never rebuild a missing case from a stale read');
 store.orders[id].returnCase={status:'Under review',messages:{}};await api.reviewOrderReturn({orderId:id,decision:'Approved',message:'Approved; follow the return instructions.'},admin);assert.equal(store.orders[id].status,'Return Approved');assert(!store.orders[id].refundId);
 const html=fs.readFileSync(path.join(__dirname,'../dashboard.html'),'utf8'),start=html.indexOf('const getSafeStatus ='),end=html.indexOf('\n                };',start)+'\n                };'.length;const ctx={};vm.runInNewContext(html.slice(start,end)+';this.status=getSafeStatus;',ctx);
 assert.equal(ctx.status('Return Requested',{status:'Approved'}),'Return Approved');assert.equal(ctx.status('Return Requested',{status:'Declined'}),'Return Declined');assert.equal(ctx.status('Refunded',{status:'Approved'}),'Refunded');assert.equal(ctx.status('Return Declined'),'Return Declined');assert(html.includes("'Return Declined': 'RETURN DECLINED'"));
 console.log('PASS actual return service with cold-null transaction/retry adapter: saved evidence, duplicate protection, customer/admin access, six-file limit, independent new case, unauthorized/closed/racing/missing cases, approved/declined state and customer labels; no refund issued');
})().catch(e=>{console.error(e);process.exitCode=1;});
