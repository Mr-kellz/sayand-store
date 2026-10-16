'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/main.js'),'utf8');
const fn=source.slice(source.indexOf('function announcementText('),source.indexOf('function observeAnnouncementLayout('));
const box={};vm.runInNewContext(fn,box);
assert.equal(box.announcementText('GET 25% OFF ORDERS ABOVE €150 AT CHECKOUT',{isPromo:true,promoMinAmount:150}),'GET 25% OFF ORDERS €150 or more AT CHECKOUT');
assert.equal(box.announcementText('Above €200',{isPromo:true,promoMinAmount:150}),'Above €200');
assert.equal(box.announcementText('Above €150',{isPromo:false,promoMinAmount:150}),'Above €150');
console.log('PASS promotion threshold wording and nonpromotion preservation');
