'use strict';
const assert=require('node:assert/strict'),W=require('../js/order-workflow'),{install}=require('../functions/order-shipping');
const id='a'.repeat(20),base={status:'Paid',paymentDate:'2026-10-24',stripeSessionId:'test',shippingInfo:{email:'test@example.test',firstName:'Test',country:'Italy'},items:[{name:'DROP',isPreorder:true,expectedShipDate:'2026-12-02'},{name:'Regular'}]};
let state,sendCount=0,mailError=false;const copy=v=>structuredClone(v);
const db={ref(path){const keys=path.split('/'),get=()=>keys.reduce((a,k)=>a?.[k],state),put=v=>{let obj=state;for(const k of keys.slice(0,-1))obj=obj[k]??={};obj[keys.at(-1)]=copy(v);};return {transaction:async fn=>{const result=fn(copy(get()));if(result===undefined)return {committed:false};put(result);return {committed:true,snapshot:{val:()=>copy(result)}};},child:k=>db.ref(path+'/'+k),update:async fields=>put({...get(),...fields})};}};
const api=install({database:{ref:()=>({onUpdate:fn=>fn})}},{db,call:fn=>fn,uid:c=>c.uid,ADMIN:'admin',fail:(code,m)=>{throw Object.assign(Error(m),{code});},mail:async(to,template,p)=>{sendCount++;assert.equal(to,'test@example.test');assert.equal(template,7);assert.equal(p.trackingNumber,'TRACK-1');if(mailError)throw Error('Provider timeout');}});
const notify=before=>api.notifyOrderShipped({before:{val:()=>before},after:{val:()=>copy(state.orders[id])}},{params:{orderId:id}});
(async()=>{
 assert(W.pending(base));assert(!W.pending({...base,status:'Pending',paymentDate:null,stripeSessionId:null}));assert(!W.pending({...base,items:[{name:'Regular'}]}));assert.match(W.itemStatus(base,base.items[0]),/PREORDERED/);
 for(const status of ['Shipped','Delivered','Canceled','Canceled (By Admin)','Canceled (By User)','Refunded','Return Requested'])assert(!W.pending({...base,status}));
 state={orders:{[id]:copy(base)}};await assert.rejects(api.shipStoreOrder({orderId:id,tracking:'TRACK-1'},{uid:'customer'}),e=>e.code==='permission-denied');await assert.rejects(api.shipStoreOrder({orderId:id,tracking:''},{uid:'admin'}));assert.equal(state.orders[id].status,'Paid');
 await api.shipStoreOrder({orderId:id,tracking:'TRACK-1'},{uid:'admin'});assert.equal(state.orders[id].status,'Shipped');assert(!W.pending(state.orders[id]));assert.match(W.itemStatus(state.orders[id],base.items[0]),/SHIPPED/);assert.deepEqual(state.orders[id].items,base.items);
 await Promise.all([notify(base),notify(base)]);assert.equal(sendCount,1);assert.equal(state.orders[id].shipmentEmail.state,'sent');await api.shipStoreOrder({orderId:id,tracking:'TRACK-1'},{uid:'admin'});await notify(base);assert.equal(sendCount,1);
 await assert.rejects(api.shipStoreOrder({orderId:id,tracking:'OTHER'},{uid:'admin'}));
 for(const status of ['Pending','Payment Review','Canceled','Refunded','Delivered']){state.orders[id]={...copy(base),status};await assert.rejects(api.shipStoreOrder({orderId:id,tracking:'TRACK-1'},{uid:'admin'}));}
 state.orders[id]=copy(base);mailError=true;await api.shipStoreOrder({orderId:id,tracking:'TRACK-1'},{uid:'admin'});await notify(base);assert.equal(state.orders[id].shipmentEmail.state,'needs_review');await notify(base);assert.equal(sendCount,2);
 console.log('PASS paid/mixed preorder grouping, customer labels, admin-only shipment, required tracking, atomic status move, preserved items, email trigger, concurrent/replayed event deduplication and failed-email review. No real email sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
