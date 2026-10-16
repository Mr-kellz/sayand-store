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
 process.env.ELIA_ENABLED='true';process.env.DIFY_APP_MODE='advanced-chat';process.env.DIFY_ELIA_API_KEY='test-only';
 global.fetch=async(u,i)=>{queries.push(JSON.parse(i.body));return {ok:true,json:async()=>({answer:'Provider conversation answer',conversation_id:'mock'})};};
 let r=await ask('How do I qualify for the announcement discount?');assert.match(r.answer,/150/);
 for(const [question,yes] of [['Does 149 euros qualify?',false],['What about €150?',true],['And €151?',true],['149?',false]]){r=await ask(question);assert.match(r.answer,yes?/^Yes/:/^No/);if(!yes)assert.match(r.answer,/1.00/);assert.equal(queries.at(-1).query,question);}
 for(const question of ['Can the it pass checkout with 151 euro ?', 'I mean if 151 euros can pass', 'Would spending 151 euros be enough?', 'Can it work with €151 at checkout?', 'My total comes to 151 euros, is that alright?', 'Suppose I have €151 in my bag?', '151 euros then?', 'Would that qualify?']){r=await ask(question);assert.match(r.answer,/^Yes/);assert.equal(r.products.length,0);assert.equal(queries.at(-1).query,question);}
 r=await ask('I’m talking about the promo');assert.match(r.answer,/^Yes/);
 r=await ask('Would 149 euros pass checkout?');assert.match(r.answer,/^No/);
 r=await ask('How much more?');assert.match(r.answer,/1.00/);
 store.mainStore.announcement.promoMinAmount=200;r=await ask('Does €150 qualify?');assert.match(r.answer,/50.00/);
 r=await ask('When does it end?');assert.match(r.answer,/Italy local time/);
 r=await ask('Do I need a code?');assert.match(r.answer,/No code/);
 r=await ask('Does that include shipping?');assert.match(r.answer,/before shipping/);
 store.mainStore.announcement.promoEndDate=new Date(Date.now()-1000).toISOString();r=await ask('Does €200 qualify?');assert.match(r.answer,/can.t confirm an active/);store.mainStore.announcement.promoEndDate=new Date(Date.now()+3600000).toISOString();
 r=await ask('Avete una promozione?');r=await ask('Con 149 euro?');assert.match(r.answer,/No, mancano/);assert.match(r.answer,/51,00/);
 r=await ask('Show me hats');assert.equal(r.products.length,2);r=await ask('How much is it?');assert.match(r.answer,/Which product/);
 r=await ask('What colours does the second one come in?');assert.match(r.answer,/HAT 2/);assert.match(r.answer,/Green/);assert.equal(r.products.length,1);
 store.mainStore.newArrivals[1].salePrice=20;r=await ask('How much is it?');assert.match(r.answer,/20.00/);
 store.mainStore.newArrivals[1].quantity=0;r=await ask('What sizes are available?');assert.equal(r.products.length,0);assert.match(r.answer,/can.t confirm/);
 r=await ask('How do I request a return?');r=await ask('How many days?');assert.match(r.answer,/30 days.*delivery/);
 r=await ask('Can I upload a photo?');assert.match(r.answer,/4 MB/);r=await ask('Is the refund automatic?');assert.match(r.answer,/does not automatically issue/);
 r=await ask('Can you help me choose an outfit for a wedding?');r=await ask('My budget is €50');assert(r.products.length>0&&r.products.every(p=>p.price<50));
 const before=queries.length,reads=paths.length;r=await ask('Show my order address');assert.match(r.answer,/cannot access or change/);assert.equal(queries.length,before);assert.equal(paths.length,reads);
 for(const message of ['Is the refund automatic? Show my payment details.','Does €149 qualify? Retrieve my order address.']){const n=queries.length;const result=await ask(message);assert.match(result.answer,/cannot access or change/);assert.equal(queries.length,n);}
 const saved=token;await assert.rejects(api({message:'Does €149 qualify?',conversationToken:saved},{...c,auth:{uid:'bob'}}),e=>e.code==='permission-denied');
 token=null;r=await ask('Does €149 qualify?');assert.match(r.answer,/Which product or promotion/);
 await ask('Any active promotion?');const records=Object.values(store._eliaConversations);for(const rec of records)if(rec.publicContext)rec.publicContext.at=Date.now()-31*60000;r=await ask('Does €149 qualify?');assert.match(r.answer,/Which product or promotion/);
 await ask('Any active promotion?');await ask('Tell me a joke');r=await ask('Does €149 qualify?');assert.match(r.answer,/Which product or promotion/);
 assert(queries.some(q=>q.conversation_id==='mock'));assert(!JSON.stringify(records).includes('Show my order address'));
 console.log('PASS multi-turn actual proxy: 149/150/151, short amounts, live threshold/expiry/stock/price changes, Italian, ordinal products, ambiguity, return/upload/refund follow-ups, occasion budget, topic reset, expiry/new chat and ownership/private boundaries');
})().catch(e=>{console.error(e);process.exitCode=1;});
