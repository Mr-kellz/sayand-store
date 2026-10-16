'use strict';
const assert=require('node:assert/strict'),E=require('../functions/elia-semantic');
const {fixture,database}=require('./fixtures/semantic-support');
(async()=>{
 const snap=await E.snapshot(database(fixture()));
 for(const [subtotal,eligible,discount,shortfall] of [['14.90',false,'0.00','0.10'],['15.00',true,'3.75','0.00'],['16.00',true,'4.00','0.00']]){
  const [r]=E.calculate({tools:[{name:'promotion_eligibility',subtotal}]},snap);
  assert.equal(r.meetsMinimum,eligible);assert.equal(r.estimatedItemDiscount,discount);assert.equal(r.shortfall,shortfall);
 }
 const gown=snap.facts.catalogue.products.find(p=>p.name==='BUBU GOWN 3');
 const hat=snap.facts.catalogue.products.find(p=>p.name==='HAT 2');
 assert.deepEqual(gown.sizes,['M']);assert.deepEqual(hat.sizes,['OS']);
 const expired={...snap,facts:{...snap.facts,promotion:{...snap.facts.promotion,endsAt:0}}};
 const [r]=E.calculate({tools:[{name:'promotion_eligibility',subtotal:'16'}]},expired);
 assert.equal(r.active,false);assert.equal(r.estimatedItemDiscount,undefined);
 console.log('PASS: below/exact/above threshold discounts, expired offer, distinct available product sizes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
