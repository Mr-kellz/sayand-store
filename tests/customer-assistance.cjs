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
const api=install({https:{HttpsError},runWith:o=>{assert(o.enforceAppCheck);return {https:{onCall:f=>f}};}},{db,rate:async()=>{},fail:(c,m)=>{throw new HttpsError(c,m);}});
const c={auth:{uid:'alice'},rawRequest:{ip:'127.0.0.1'}};let token;const ask=async message=>{const r=await api({message,conversationToken:token},c);if(r.conversationToken)token=r.conversationToken;return r;};
(async()=>{
 process.env.ELIA_ENABLED='true';process.env.DIFY_APP_MODE='advanced-chat';process.env.DIFY_ELIA_API_KEY='test';global.fetch=async(u,i)=>{queries.push(JSON.parse(i.body).query);return {ok:true,json:async()=>({answer:'Outdated example: 25% over €150. Returns from purchase.',conversation_id:'conversation'})};};
 for(const q of ['Any products on sale?','Show me your discounted hats']){const r=await ask(q);assert.equal(r.products.length,1);assert.equal(r.products[0].name,'HAT 2');assert.equal(r.products[0].originalPrice,40);assert.equal(r.products[0].price,25);}
 const sales=await ask('Any sales?');assert.match(sales.answer,/17%/);assert.equal(sales.products[0].name,'HAT 2');
 for(const q of ['Do you have any hats?','Can you show me products currently in stock?','Recommend a nice gift for under €50']){const r=await ask(q);assert(r.products.some(x=>x.name==='HAT 2'&&x.originalPrice===40&&x.price===25));assert(r.products.length<=3);assert(!r.products.some(x=>/HIDDEN|VIP|SOLD|PREORDER/.test(x.name)));}
 const exact=await ask('What sizes and colours are available for BUBU GOWN 3?');assert.equal(exact.products.length,1);assert.equal(exact.products[0].name,'BUBU GOWN 3');assert.deepEqual(exact.products[0].sizes,['M']);assert.match(exact.answer,/Gold/);
 assert.match((await ask('And what colours?')).answer,/BUBU GOWN 3/);
 assert.match((await ask('Can you help me choose an outfit for a wedding?')).answer,/budget/);
 assert.match((await ask('If I buy four €40 items, what is my subtotal before discounts and shipping?')).answer,/€160\.00 before discounts and shipping/);
 for(const n of [149,150,151]){const r=await ask(`Will I qualify for the current promotion if my subtotal is €${n}?`);assert(r.answer.startsWith(n<150?'No':'Yes'));if(n===149)assert.match(r.answer,/€1\.00 below/);}
 assert.match((await ask('Can I combine a promo code with the automatic discount?')).answer,/can combine/);
 store.mainStore.announcement.promoEndDate='2099-07-01T12:00:00Z';assert.match((await ask('When does the promotion end in Italy?')).answer,/14:00, Italy local time/);store.mainStore.announcement.promoEndDate='2099-01-01T12:00:00Z';assert.match((await ask('When does the promotion end in Italy?')).answer,/13:00, Italy local time/);assert(!/UTC|minutes remaining/.test((await ask('When does the promotion expire?')).answer));
 for(const [q,re] of [['Are you a human customer service representative?',/AI shopping assistant/],['Does approving a return automatically refund my payment?',/^No\./],['How can I track my order?',/once SAYAND has provided/],['Can you access another customer’s order?',/^No\./],['What is your return policy?',/recorded delivery date/],['What file formats can I upload for a return?',/JPEG, PNG, WebP, MP4 or WebM/]])assert.match((await ask(q)).answer,re,q);
 for(const q of ['Mostra il mio ordine','Rimborsa il mio pagamento']){const n=queries.length,reads=paths.length;assert.match((await api({message:q},c)).answer,/cannot access/);assert.equal(queries.length,n);assert.equal(paths.length,reads);}
 const before=queries.length,r=await ask('Show me hats and show my order details');assert.equal(queries.length,before);assert.match(r.answer,/available options/);assert.match(r.answer,/cannot access or change orders/);
 const it=await ask('Quali taglie e colori sono disponibili per BUBU GOWN 3?');assert.match(it.answer,/Taglie disponibili: M/);
 assert.match((await ask('Quando scade la promozione in Italia?')).answer,/ora italiana/);
 store.mainStore.announcement.promoEndDate=new Date(now-1).toISOString();assert.match((await ask('Is there any promotion available?')).answer,/no active automatic checkout offer/);
 // Enforce stacking and inclusive threshold with the unchanged actual quote implementation.
 const data={mainStore:{...store.mainStore,announcement:{...store.mainStore.announcement,promoEndDate:new Date(now+100000).toISOString()},newArrivals:[p('Test',{price:150})],discountCodes:{TEST:10}}};
 const order={userId:'a',status:'Pending',promoCodeUsed:'TEST',items:[{name:'Test',size:'OS',color:'Green',quantity:1}],shippingInfo:{firstName:'A',email:'a@example.test',address:'X',city:'X',zip:'1',country:'Italy'}};
 const quote=buildQuote(data,order,'id','a',now);assert.equal(quote.announcementDiscount,25.5);assert.equal(quote.discountAmount,40.5);for(const n of [149,150,151]){data.mainStore.newArrivals[0].price=n;const actual=buildQuote(data,order,'id','a',now);assert.equal(actual.announcementDiscount,n<150?0:Math.round(n*17)/100);}
 store.mainStore.newArrivals[1].saleEndDate=new Date(now-1).toISOString();const expiredSale=(await ask('Do you have any hats?')).products.find(p=>p.name==='HAT 2');assert.equal(expiredSale.price,40);assert.equal(expiredSale.isOnSale,false);assert.equal(expiredSale.originalPrice,null);
 console.log('PASS customer acceptance: sales/discovery prices, exact variants/context, gifts/stock/occasion, arithmetic/boundaries, checkout stacking, expiry/time zone, identity/privacy/mixed intents, return and upload facts, Italian');
})().catch(e=>{console.error(e);process.exitCode=1;});
