'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {buildQuote,applyPayment}=require('../functions/checkout-security');
const {render}=require('../functions/catalogue');
const now=Date.parse('2026-10-23T10:00:00Z');
const p={name:'PREORDER TEST',price:70,preorderPrice:60,quantity:3,sizes:['S','M'],category:'women',isPreorder:true,expectedShipDate:'2026-12-01',images:['https://example.test/image.jpg']};
const order={userId:'tester',status:'Pending',items:[{name:p.name,size:'S',color:'Default',quantity:1,price:0.01,isPreorder:true,expectedShipDate:p.expectedShipDate}],shippingInfo:{firstName:'Test',email:'test@example.test',address:'Test',city:'Test',zip:'00000',country:'Italy'}};
function root(patch={}) {return {mainStore:{upcomingSales:[{...p,...patch}]},orders:{id:structuredClone(order)}};}
function quote(r){return buildQuote(r,r.orders.id,'id','tester',now);}
let r=root(),q=quote(r);assert.equal(q.items[0].price,60);assert.equal(q.subtotal,60);assert.equal(q.totalAmount,65);assert.equal(q.items[0].launchPrice,70);assert.equal(q.items[0].expectedShipDate,p.expectedShipDate);
for(const patch of [{preorderPrice:0},{preorderPrice:71},{preorderPrice:'bad'},{expectedShipDate:''},{expectedShipDate:'2026-10-01'},{expectedShipDate:'2027-02-30'},{quantity:0},{isOutOfStock:true},{isHidden:true},{isDraft:true}])assert.throws(()=>quote(root(patch)),undefined,JSON.stringify(patch));
r=root();r.orders.id.items[0].isPreorder=false;assert.throws(()=>quote(r),/details have changed/);
r=root();r.orders.id.items[0].quantity=4;assert.throws(()=>quote(r),/insufficient stock/);
r=root();r.orders.id.items.push({...r.orders.id.items[0],size:'M',quantity:3});assert.throws(()=>quote(r),/insufficient stock/);
r=root({sizeQuantities:{S:0,M:3}});assert.throws(()=>quote(r),/insufficient stock/);
r=root();q=quote(r);q.sessionId='cs_test_fixture';r.checkoutQuotes={id:q};
const session={id:q.sessionId,metadata:{orderId:'id',userId:'tester'},currency:'eur',amount_total:q.amount,payment_status:'paid'};
assert.throws(()=>applyPayment(structuredClone(r),{...session,amount_total:1},now),/does not match/);
applyPayment(r,session,now);assert.equal(r.mainStore.upcomingSales[0].quantity,2);assert.equal(r.orders.id.status,'Paid');assert.equal(r.orders.id.items[0].price,60);assert.equal(r.orders.id.items[0].isPreorder,true);
applyPayment(r,session,now+1000);assert.equal(r.mainStore.upcomingSales[0].quantity,2);
// Launching the product never reprices an already-paid preorder.
r.mainStore.newArrivals=[{...r.mainStore.upcomingSales[0],isPreorder:false}];r.mainStore.upcomingSales=[];applyPayment(r,session,now+2000);assert.equal(r.orders.id.items[0].price,60);
const templates={product:fs.readFileSync('functions/templates/product.html','utf8'),collection:fs.readFileSync('functions/templates/collection.html','utf8'),notFound:'Missing'};
const data={upcomingSales:[{...p,privateNotes:'DO NOT EXPORT'},{...p,name:'SECRET',isVipOnly:true},{...p,name:'HIDDEN',isHidden:true}]};
const api=render(data,'/api/public-preorders',templates,{now});const drops=JSON.parse(api.body);assert.equal(drops.length,1);assert.equal(drops[0].preorderPrice,60);assert.doesNotMatch(api.body,/DO NOT EXPORT|SECRET|HIDDEN/);
const page=render(data,'/product-preorder-test',templates,{now});assert.equal(page.status,200);assert.match(page.body,/https:\/\/schema.org\/PreOrder/);assert.match(page.body,/"price":"60.00"/);assert.match(render(data,'/sitemap.xml',templates,{now}).body,/product-preorder-test/);
// Browser public data projection keeps launch and selling prices distinct.
const context={window:{},fetch:async path=>({ok:true,json:async()=>path.includes('preorders')?drops:{}}),firebase:{database:()=>({ref:()=>({once:async()=>({val:()=>null})})})},console};vm.createContext(context);vm.runInContext(fs.readFileSync('js/public-store.js','utf8'),context);
(async()=>{const d=(await context.window.SayandPublicStore.once()).val();assert.equal(d.upcomingSales[0].price,60);assert.equal(d.upcomingSales[0].launchPrice,70);console.log('PASS preorder server pricing, capacity, dates, paid fulfillment, duplicate webhook, launch preservation, public filtering and dynamic pages');})().catch(e=>{console.error(e);process.exitCode=1;});
