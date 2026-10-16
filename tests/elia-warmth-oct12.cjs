'use strict';
const assert=require('node:assert/strict');
const {reply}=require('../functions/elia-catalogue');
const data={newArrivals:[{name:'HAT',quantity:2,price:40},{name:'SALE GOWN',quantity:2,price:60,salePrice:40}],trending:[],sales:[]};
let r=reply(data,'Do you have a hat?');assert.match(r.answer,/happy to help/);assert.match(r.answer,/help choosing a size or colour/);assert.equal(r.products[0].name,'HAT');assert(r.answer.length<280);
r=reply(data,'Which product is on sale?');assert.equal(r.products.length,1);assert.equal(r.products[0].name,'SALE GOWN');assert.equal(r.products[0].price,40);
r=reply(data,'Do you have shoes?');assert.equal(r.products.length,0);assert.match(r.answer,/style you have in mind/);
data.newArrivals[0].quantity=0;r=reply(data,'hat');assert.equal(r.products.length,0);assert.match(r.answer,/another style/);
console.log('PASS warmer assistance, helpful follow-up, sale phrasing and accurate stock/prices');
