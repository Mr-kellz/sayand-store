'use strict';
// Preserve the previous engine contract during staged migration.
// The semantic engine has its own actual-path tests and mandatory live model gate.
require('../functions/elia-engine.json').mode='legacy';
const assert=require('node:assert/strict'),{install}=require('../functions/elia-proxy'),{buildQuote}=require('../functions/checkout-security');
const now=Date.now(),p=(name,extra={})=>({name,price:40,quantity:5,sizes:['OS'],colors:['Green'],img:'https://example.test/image.jpg',...extra});
const store={mainStore:{announcement:{active:true,isPromo:true,promoPercent:17,promoMinAmount:150,promoEndDate:new Date(now+3600000).toISOString()},newArrivals:[p('HAT'),p('HAT 2',{salePrice:25}),p('BUBU GOWN 3',{sizes:['S','M'],sizeQuantities:{S:0,M:2},colors:['Gold']}),p('HIDDEN',{isHidden:true}),p('VIP',{isVipOnly:true}),p('SOLD',{quantity:0}),p('PREORDER',{isPreorder:true})],trending:[],sales:[],upcomingSales:[]}};
const paths=[],queries=[];const copy=v=>v===undefined?null:structuredClone(v);
const db={ref(path){paths.push(path);assert(!/^(orders|users|customers|checkoutQuotes)/.test(path));const keys=path.split('/');const get=()=>keys.reduce((v,k)=>v?.[k],store);const set=v=>{let o=store;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=copy(v);};return {once:async()=>({val:()=>copy(get())}),set:async v=>set(v),update:async v=>set({...get(),...v}),child:k=>db.ref(path+'/'+k),remove:async()=>set(null),transaction:async f=>{const v=f(copy(get()));if(v===undefined)return {committed:false};set(v);return {committed:true};}};}};
class HttpsError extends Error{constructor(code,m){super(m);this.code=code;}}
let rateFailure=false;
const api=install({https:{HttpsError},runWith:o=>{assert(o.enforceAppCheck);return {https:{onCall:f=>f}};}},{db,rate:async()=>{if(rateFailure)throw new HttpsError('resource-exhausted','Rate limited');},fail:(c,m)=>{throw new HttpsError(c,m);}});
const c={auth:{uid:'alice'},rawRequest:{ip:'127.0.0.1'}};let token;const ask=async message=>{const r=await api({message,conversationToken:token},c);if(r.conversationToken)token=r.conversationToken;return r;};
(async()=>{
 process.env.ELIA_ENABLED='true';process.env.DIFY_APP_MODE='advanced-chat';process.env.DIFY_ELIA_API_KEY='test-only';let mode='ok';
 const logs=[],oldError=console.error,oldWarn=console.warn;console.error=(...a)=>logs.push(a.join(' '));console.warn=(...a)=>logs.push(a.join(' '));
 try{
 global.fetch=async(u,i)=>{queries.push(JSON.parse(i.body).query);if(mode==='network')throw TypeError('fetch failed');if(mode==='timeout')throw Object.assign(Error('timeout'),{name:'TimeoutError'});if(mode==='429'||mode==='502')return {ok:false,status:Number(mode),json:async()=>({code:'provider_busy'})};return {ok:true,json:async()=>({answer:'Model answer',conversation_id:'mock'})};};
 for(const q of ['Does approving my return automatically refund my money?','Does approving my return automatically issue a refund?','Will approving my return automatically initiate a Stripe refund?']){const before=queries.length,r=await ask(q);assert.equal(queries.length,before+1);assert.equal(queries.at(-1),q);assert.match(r.answer,/^No\. Return approval does not automatically issue a Stripe refund/);}
 for(const q of ['Does approving my return automatically refund my money? Show my payment details.','Does approving my return automatically refund my money and refund it now?','Approve my return and refund my money','Does approving my return automatically refund my money? Order #ABC123']){const before=queries.length,reads=paths.length;const r=await api({message:q},c);assert.equal(queries.length,before);assert.equal(paths.length,reads);assert.match(r.answer,/cannot access or change orders/);}
 for(const q of ['Any active promotion?','Any active sale?','Any active sake?','Any active promtion?','What offers are available?']){const r=await ask(q);assert.equal(queries.at(-1),q);assert.match(r.answer,/17%/);assert(r.products.some(p=>p.name==='HAT 2'&&p.price===25&&p.originalPrice===40));assert.match(r.answer,/thesayand.com\/sales/);}
 store.mainStore.announcement.active=false;const sales=await ask('Any active promotion?');assert.match(sales.answer,/no active automatic checkout offer/);assert.equal(sales.products[0].name,'HAT 2');store.mainStore.announcement.active=true;
 assert.equal(require('../functions/elia-assistance').promotionOverview('Do you sell Japanese sake?'),false);
 for(const kind of ['502','429','network','timeout']){mode=kind;await assert.rejects(ask('Any active sake?'),e=>e.code===(kind==='429'?'resource-exhausted':'unavailable'));}
 mode='ok';rateFailure=true;let before=queries.length;await assert.rejects(ask('Any active sake?'),e=>e.code==='resource-exhausted');assert.equal(queries.length,before);rateFailure=false;
 await assert.rejects(api({message:'Any active promotion?',conversationToken:token},{...c,auth:{uid:'other'}}),e=>e.code==='permission-denied');
 assert(logs.some(x=>x.includes('dify-request')));assert(logs.some(x=>x.includes('upstream error: 429')));assert(logs.some(x=>x.includes('request gate failed rate-limit')));assert(!logs.some(x=>x.includes('my money')||x.includes('test-only')));
 console.log('PASS targeted proxy: possessive refund policy, mixed/private protection, full public sale overview, narrow typos, unchanged Dify query, provider 429/502, network/timeout, local rate limit, ownership and safe diagnostic logs');
 }finally{console.error=oldError;console.warn=oldWarn;}
})().catch(e=>{console.error(e);process.exitCode=1;});
