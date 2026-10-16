'use strict';
const assert=require('node:assert/strict'),{eligible}=require('../functions/newsletter-eligibility'),{buildQuote}=require('../functions/checkout-security'),{quoteOrder}=require('../functions/payment-store');
const now=Date.now(),uid='alice',id='-'+'a'.repeat(19);
const order={userId:uid,status:'Pending',promoCodeUsed:'WELCOME10',items:[{name:'Hat',quantity:1,size:'OS',color:'Black'}],shippingInfo:{firstName:'A',email:'subscriber@example.test',address:'Street',city:'City',zip:'12345',country:'Italy'}};
const state={orders:{[id]:order},mainStore:{newArrivals:{hat:{name:'Hat',price:40,quantity:10,sizes:['OS'],colors:['Black']}},discountCodes:{WELCOME10:10,OTHER:5}},subscribers:{a:{email:'alice@example.test',subscribedAt:now,consent:{granted:true,doubleOptIn:true}}}};
let user={email:'Alice@Example.Test',emailVerified:true},authReads=0,subscriptionFailure=false;const auth={getUser:async()=>{authReads++;return user;}};
function snapshot(value){return {val:()=>structuredClone(value??null),exists:()=>value!=null,child:k=>snapshot(value?.[k])};}
const db={ref(p){let key,match;const parts=p.split('/');const get=()=>parts.reduce((v,k)=>v?.[k],state);const read=()=>{const v=get();return key?Object.fromEntries(Object.entries(v||{}).filter(([,r])=>r[key]===match)):v;};return {orderByChild(k){key=k;return this;},equalTo(v){match=v;return this;},once:async()=>{if(p==='subscribers'&&subscriptionFailure)throw Error('Database unavailable');return snapshot(read());},on(event,fn){fn(snapshot(read()));return fn;},off(){},transaction:async fn=>{const v=fn(structuredClone(get()??null));if(v===undefined)return {committed:false,snapshot:snapshot(get())};let parent=state;for(const k of parts.slice(0,-1))parent=parent[k]??={};parent[parts.at(-1)]=v;return {committed:true,snapshot:snapshot(v)};}};}};
class HttpsError extends Error{constructor(code,m){super(m);this.code=code;}}
const functions={https:{HttpsError},runWith:()=>({https:{onCall:f=>f,onRequest:f=>f}})};
const services=require('../functions/store-services').install(functions,{database:()=>db,auth:()=>auth},async()=>{}).exports;
const context={auth:{uid},rawRequest:{ip:'test'}};
(async()=>{
assert(await eligible(db,auth,uid));assert.equal((await services.validatePromo({code:' welcome10 ',email:'fake@example.test',subscribed:true},context)).valid,true);
const q=await quoteOrder(db,id,uid,now,'test',auth);assert.equal(q.discountAmount,4);assert.equal(q.amount,4100);
for(const record of [null,{email:'alice@example.test',subscribedAt:now,status:'pending'},{email:'alice@example.test',subscribedAt:now,consent:{granted:false}},{email:'alice@example.test',subscribedAt:now,unsubscribedAt:now}]){state.subscribers=record?{a:record}:{};assert.equal((await services.validatePromo({code:'WELCOME10',email:'subscriber@example.test',subscribed:true},context)).valid,false);await assert.rejects(quoteOrder(db,id,uid,now,'test',auth),/newsletter/);}
state.subscribers={a:{email:'alice@example.test',subscribedAt:now}};assert(await eligible(db,auth,uid),'existing legacy subscriber remains eligible');user.emailVerified=false;assert(!await eligible(db,auth,uid));await assert.rejects(quoteOrder(db,id,uid,now,'test',auth));user.emailVerified=true;user.email='not-subscribed@example.test';assert(!await eligible(db,auth,uid));user.email='alice@example.test';user.disabled=true;assert(!await eligible(db,auth,uid));user.disabled=false;
state.subscribers.b={email:'alice@example.test',subscribedAt:now,consent:{granted:false}};assert(!await eligible(db,auth,uid));delete state.subscribers.b;
subscriptionFailure=true;await assert.rejects(quoteOrder(db,id,uid,now,'test',auth),/Database unavailable/);subscriptionFailure=false;
assert.throws(()=>buildQuote({mainStore:state.mainStore},order,id,uid,now),/newsletter/);
state.checkoutQuotes={};state.orders[id].promoCodeUsed='OTHER';const reads=authReads;assert.equal((await quoteOrder(db,id,uid,now,'test',auth)).discountAmount,2);assert.equal(authReads,reads);assert.equal((await services.validatePromo({code:'OTHER'},context)).valid,true);
await assert.rejects(services.validatePromo({code:'WELCOME10'},{rawRequest:{ip:'test'}}),e=>e.code==='unauthenticated');
console.log('PASS actual validatePromo/quoteOrder: verified subscriber eligibility, legacy records, pending/non-subscribed/opt-out/disabled/unverified rejected, cached quote rechecked, browser claims ignored, lookup failures fail closed, unrelated codes unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;});
