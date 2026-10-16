'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(__dirname+'/../js/purchase-confirmation.js','utf8');
const id='-abcdefghijklmnopqrs',uid='customer';
function run(pending,user={uid}) {
 const calls=[],elements={'confirmation-title':{},'confirmation-message':{}},listeners={};let orderListener;
 const c={window:null,Date,JSON,Number,Object,clearTimeout:()=>{},setTimeout:()=>1,
 sessionStorage:{getItem:()=>pending?JSON.stringify(pending):null},document:{getElementById:id=>elements[id]},
 firebase:{auth:()=>({onAuthStateChanged:fn=>fn(user)}),database:()=>({ref:p=>{calls.push(['read',p]);return {on:(e,fn)=>{if(p.startsWith('users/')) fn({val:()=>pending.cart.a});else orderListener=fn;return fn;},off:()=>{},transaction:fn=>{calls.push(['transaction',p,fn]);return Promise.resolve();}};}})},
 SayandAnalytics:{purchase:(...args)=>calls.push(['purchase',...args])},addEventListener:(n,fn)=>listeners[n]=fn};c.window=c;vm.runInNewContext(code,c);
 return {calls,e:elements,emit:o=>orderListener({val:()=>o})};
}
(async () => {
let r=run(null);assert.equal(r.calls.length,0);assert.equal(r.e['confirmation-title'].textContent,'Check your order');
const pending={id,uid,at:Date.now(),cart:{a:{name:'Gown',size:'One',color:'Mix',quantity:1,addedAt:123}}};
r=run(pending,{uid:'other'});assert.equal(r.calls.length,0);
r=run(pending);r.emit({userId:uid,status:'Pending'});assert(!r.calls.some(c=>c[0]==='transaction'||c[0]==='purchase'));
r.emit({userId:uid,status:'Paid',stripeSessionId:'cs_live_test',paymentDate:'2026-10-05'});
assert.equal(r.e['confirmation-title'].textContent,'Order confirmed');
await new Promise(resolve=>setImmediate(resolve));
const tx=r.calls.find(c=>c[0]==='transaction');assert(tx);assert.equal(tx[2](pending.cart.a),null);assert.equal(tx[2]({...pending.cart.a,quantity:2}),undefined);assert.equal(tx[2]({...pending.cart.a,addedAt:999}),undefined);
r=run(pending);r.emit({userId:uid,status:'Payment Review',paymentDate:'2026-10-05',stripeSessionId:'cs_live_test'});assert(!r.calls.some(c=>c[0]==='transaction'||c[0]==='purchase'));
console.log('PASS: direct success-page visits, wrong account, pending/review orders, paid confirmation, and preserving changed cart rows.');

})().catch(e=>{console.error(e);process.exitCode=1;});
