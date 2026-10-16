'use strict';
const assert=require('node:assert/strict');
const {activePromotion,promotionIntent,promotionReply,basket}=require('../functions/elia-promotions');
const {shoppingQuestion}=require('../functions/elia-catalogue');
const {buildQuote}=require('../functions/checkout-security');
const now=Date.now(),ann={active:true,isPromo:true,promoPercent:17,promoMinAmount:150,promoEndDate:new Date(now+3600000).toISOString()};
assert.deepEqual(activePromotion(ann,now),{percent:17,minimum:15000,ends:now+3600000});
for(const patch of [{active:false},{isPromo:false},{promoEndDate:new Date(now).toISOString()},{promoEndDate:'invalid'},{promoPercent:101},{promoMinAmount:-1}])assert.equal(activePromotion({...ann,...patch},now),null);
assert.equal(activePromotion({text:'Example: 25% off above €150'},now),null);
const product=(name,price=40,quantity=5,extra={})=>({name,price,quantity,sizes:['OS'],colors:['Green'],img:'https://example.test/photo.jpg',...extra});
const data={announcement:ann,newArrivals:{a:product('Gown'),b:product('Hat',35),c:product('Shirt',19.99),d:product('Hidden',1,9,{isHidden:true}),e:product('VIP',1,9,{isVipOnly:true}),f:product('Preorder',1,9,{isPreorder:true}),g:product('Empty',1,0),h:product('Unknown',1,null),i:product('Bad size',1,5,{sizeQuantities:{OS:0}})},trending:{},sales:{},upcomingSales:{}};
let reads=[];
const db={ref(path){reads.push(path);assert(/^mainStore\/(announcement|newArrivals|trending|sales|upcomingSales)$/.test(path));return {once:async()=>({val:()=>data[path.split('/')[1]]})};}};
const questions=['Is there any promotion available?','Do you have an active promotion?','Promo?','Are there discounts today?','What offers are available?','Is the discount applied automatically, or do I need a promotional code?','What is the minimum order amount?','How long is the countdown?'];
(async()=>{
 for(const q of questions){assert(promotionIntent(q),q);assert(!shoppingQuestion(q),q);const r=await promotionReply(db,q,now);assert.match(r.answer,/17%/);assert(!r.answer.includes('25%'));assert.equal(r.products.length,0);}
 data.announcement={...ann,promoPercent:12};assert.match((await promotionReply(db,'Promo?',now)).answer,/12%/);
 data.announcement={...ann,promoEndDate:new Date(now-1).toISOString()};assert.match((await promotionReply(db,'Promo?',now)).answer,/can’t confirm/);data.announcement=ann;
 const r=await promotionReply(db,'Help me find products to reach the €150 threshold.',now);assert(r.products.length>0&&r.products.length<=3);assert.match(r.answer,/separate example basket/);assert.match(r.answer,/checkout confirms/);
 const b=basket(data,15000,now);assert(b.total>=15000);assert(!b.cards.some(p=>/Hidden|VIP|Preorder|Empty|Unknown|Bad size/.test(p.name)));
 // Every displayed line is an integer quantity and totals match displayed unit prices.
 let total=0;for(const line of b.lines){const [,qty,name,amount]=line.match(/^(\d+) × (.+) \(.*\) = €([\d.]+)$/);const card=b.cards.find(p=>p.name===name);assert.equal(Math.round(Number(amount)*100),Number(qty)*Math.round(card.price*100));total+=Math.round(Number(amount)*100);}assert.equal(total,b.total);
 // Checkout's actual sale-price semantics, including malformed-price exclusion.
 const sale={newArrivals:{x:product('Sale',40,2,{salePrice:42})}};assert.equal(basket(sale,4000,now).cards[0].price,42);
 const dup={...sale,upcomingSales:{x:product('Sale')}};assert.equal(basket(dup,4000,now),null);
 assert.equal(basket({newArrivals:{x:product('Invalid',40,2,{salePrice:'bad'})}},4000,now),null);
 const failed=await promotionReply({ref(){throw Error('offline')}},'Promo?',now);assert.match(failed.answer,/can’t verify/);assert.equal(failed.products.length,0);
 console.log('PASS promotion intent, active/expired/invalid/example offers, live CMS edits, fail-closed reads, threshold cards, stock/visibility/variants/duplicates, checkout prices and basket arithmetic');
})().catch(e=>{console.error(e);process.exitCode=1;});
