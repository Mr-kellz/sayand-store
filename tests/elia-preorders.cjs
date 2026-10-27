'use strict';
const assert=require('node:assert/strict'),E=require('../functions/elia-semantic'),{fixture,database}=require('./fixtures/semantic-support');
const {boot,all,text}=require('./elia-ui-harness');
(async()=>{
 const state=fixture(),db=database(state),p={name:'CROCHET TOP',price:65.99,preorderPrice:52.99,quantity:6,isPreorder:true,sizes:['M','L'],images:['https://example.test/top.jpg'],expectedShipDate:'2099-12-02',category:'men'};
 state.mainStore.upcomingSales=[p];let snap=await E.snapshot(db),drop=snap.facts.catalogue.products.find(p=>p.name==='CROCHET TOP');
 assert(drop);assert.equal(drop.price,52.99);assert.equal(drop.launchPrice,65.99);assert.equal(drop.savings,13);assert.equal(drop.quantity,6);assert.equal(drop.inStock,false);assert.equal(drop.isOrderable,true);assert.equal(drop.isOnSale,false);assert.equal(drop.paymentTiming,'full_payment_now');
 assert.match(E.POLICIES.preorders.timing,/not a guaranteed delivery/);assert.match(E.POLICIES.preorders.payment,/not a deposit/);
 for(const patch of [{quantity:0},{preorderPrice:null},{preorderPrice:80},{expectedShipDate:'2000-01-01'},{expectedShipDate:'2099-02-30'},{isOutOfStock:true},{isVipOnly:true},{isHidden:true},{isDraft:true},{sizeQuantities:{M:0,L:0}}]){state.mainStore.upcomingSales=[{...p,...patch}];assert(!(await E.snapshot(db)).facts.catalogue.products.some(x=>x.name===p.name),JSON.stringify(patch));}
 state.mainStore.upcomingSales=[p];state.mainStore.sales=[{...p,isPreorder:false}];assert(!(await E.snapshot(db)).facts.catalogue.products.some(x=>x.name===p.name));state.mainStore.sales=[];
 const contexts=[];const request=async inputs=>{const c=JSON.parse(inputs.sayand_context);contexts.push(c);return {answer:JSON.stringify(c.phase==='plan'?{contract:E.CONTRACT,phase:'plan',tools:[]}:{contract:E.CONTRACT,phase:'answer',answer:'CROCHET TOP is a paid preorder.',productIds:['/product-crochet-top']})};};
 const result=await E.respond({db,record:{},message:'How do your preorders work?',inputs:{},request});assert.equal(result.products[0].price,52.99);assert.equal(result.products[0].inStock,false);assert(contexts.every(c=>c.facts.policies.preorders));assert(contexts.every(c=>c.facts.policies.language.includes('Hello and Hi')));assert(contexts.every(c=>c.facts.policies.productCards.includes('productIds')));
 const recovered=E.finish({answer:'You can preorder the **CROCHET TOP** now.',productIds:[]},snap);assert.equal(recovered.products[0].name,'CROCHET TOP');assert.equal(E.finish({answer:'The CROCHET TOPPER is different.',productIds:[]},snap).products.length,0);
 await assert.rejects(E.respond({db,record:{},message:'When does it dispatch?',inputs:{},request:async inputs=>{const r=await request(inputs);if(JSON.parse(inputs.sayand_context).phase==='answer')state.mainStore.upcomingSales[0].expectedShipDate='2099-12-03';return r;}}),/Catalogue changed/);
 const ui=boot('preorder-test');ui.find('Ask Elia').click();ui.find('Start chatting').click();ui.reply(async()=>result);ui.input().value='Show preorders';await ui.form().onsubmit({preventDefault(){}});
 const card=all(ui.body).find(n=>n.className==='elia-product');assert(card);assert.match(text(card),/PREORDER · PAY IN FULL NOW/);assert.match(text(card),/52.99/);assert.match(text(card),/65.99/);assert.match(text(card),/Save €13.00/);assert.match(text(card),/2 December 2099/);
 assert(!all(card).some(n=>n.tag==='del'));assert.equal(card.href,'https://thesayand.com/product-crochet-top');
 assert.equal(all(card).find(n=>n.tag==='img').src,p.images[0]);
 ui.events.pagehide();const restored=boot('preorder-test');const restoredCard=all(restored.body).find(n=>n.className==='elia-product');assert(restoredCard);assert.equal(restoredCard.href,card.href);assert.match(text(restoredCard),/52.99/);
 console.log('PASS ELIA verified preorder facts, full-payment/date policy, hidden/invalid/sold-out filtering, duplicate detection, model context, stale-date rejection, and clearly labelled preorder cards. Provider mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});
