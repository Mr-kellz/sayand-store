'use strict';
const assert=require('node:assert/strict'),E=require('../functions/elia-semantic'),{fixture,database}=require('./fixtures/semantic-support');
(async()=>{
 const store=fixture(),db=database(store);let s=await E.snapshot(db);
 assert.equal(s.facts.promotion.minimum,'15.00');assert.equal(s.facts.promotion.comparison,'>=');
 assert.deepEqual(s.facts.catalogue.products.map(p=>p.name),['BUBU GOWN 3','HAT','HAT 2']);
 const hat=s.facts.catalogue.products.find(p=>p.name==='HAT 2');assert.equal(hat.price,25);assert.equal(hat.originalPrice,40);assert(hat.isOnSale);
 assert.deepEqual(s.facts.catalogue.products[0].sizes,['M']);
 for(const [amount,eligible,gap] of [['14.90',false,'0.10'],['15',true,'0.00'],['16',true,'0.00']]){const [r]=E.calculate({tools:[{name:'promotion_eligibility',subtotal:amount}]},s);assert.equal(r.meetsMinimum,eligible);assert.equal(r.shortfall,gap);}
 store.mainStore.announcement.promoMinAmount=150;s=await E.snapshot(db);
 for(const [amount,eligible] of [['149',false],['150',true],['151',true]])assert.equal(E.calculate({tools:[{name:'promotion_eligibility',subtotal:amount}]},s)[0].meetsMinimum,eligible);
 assert.equal(E.calculate({tools:[{name:'arithmetic',operation:'multiply',values:['40','4']}]},s)[0].result,'160.00');
 assert.equal(E.calculate({tools:[{name:'arithmetic',operation:'subtract',values:['15','14.90']}]},s)[0].result,'0.10');
 assert.equal(E.calculate({tools:[{name:'arithmetic',operation:'add',values:['0.1','0.2']}]},s)[0].result,'0.30');
 for(const t of [{name:'refund',order:'123'},{name:'arithmetic',operation:'eval',values:['1','2']},{name:'promotion_eligibility',subtotal:'NaN'},{name:'promotion_eligibility',subtotal:-1}])assert.throws(()=>E.calculate({tools:[t]},s));
 const b=E.calculate({tools:[{name:'basket',target:'100'}]},s)[0];assert(b.result.productIds.length<=3);assert.equal(b.result.subtotal,'105.00');assert(b.result.lines.every(l=>l.startsWith('1 ×')));
 const answer=E.finish({answer:'Here is the hat.',productIds:[hat.id],price:1,image:'javascript:evil'},s);assert.equal(answer.products[0].price,25);assert.equal(answer.products[0].image,'https://example.test/image.jpg');assert.throws(()=>E.finish({answer:'x',productIds:['hidden']},s));
 store.mainStore.announcement.promoEndDate=new Date(Date.now()-1).toISOString();s=await E.snapshot(db);assert.equal(s.facts.promotion.active,false);assert.equal(E.calculate({tools:[{name:'promotion_eligibility',subtotal:'160'}]},s)[0].active,false);
 store.mainStore.newArrivals[1].saleEndDate=new Date(Date.now()-1).toISOString();s=await E.snapshot(db);assert.equal(s.facts.catalogue.products.find(p=>p.name==='HAT 2').price,40);
 store.mainStore.sales=[{...store.mainStore.newArrivals[0]}];s=await E.snapshot(db);assert(!s.facts.catalogue.products.some(p=>p.name==='HAT'));
 store.mainStore.newArrivals[2].sizeQuantities.M='unknown';s=await E.snapshot(db);assert(!s.facts.catalogue.products.some(p=>p.name==='BUBU GOWN 3'));
 assert.equal(E.POLICIES.returns.approvalAutomaticallyRefunds,false);assert.match(E.POLICIES.returns.startsAt,/delivery/);assert.equal(E.POLICIES.returns.evidence.maxFiles,6);
 assert.throws(()=>E.parse('Old generic provider answer','plan'));assert.throws(()=>E.parse('{"contract":"wrong","phase":"plan"}','plan'));
 console.log('PASS actual public snapshot, checkout-verified prices, stock, expiry, sale cards, exact cents/boundaries, tool allowlist and basket variety; no model involved');
})().catch(e=>{console.error(e);process.exitCode=1;});
