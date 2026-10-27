'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {render}=require('../functions/catalogue');
const templates=Object.fromEntries([['product','product.html'],['collection','collection.html'],['notFound','404.html']].map(([k,f])=>[k,fs.readFileSync('functions/templates/'+f,'utf8')]));
const source=fs.readFileSync('js/main.js','utf8');const context={};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function collectionGroupsHTML'),source.indexOf('function paidPreorderReady')),context);
for(const category of ['men','women','accessories']){
 const regular={name:'CURRENT ITEM',category,price:70,quantity:1},preorder={name:'FUTURE ITEM',category,isPreorder:true,price:70,preorderPrice:60,quantity:6,expectedShipDate:'2099-12-02'};
 const data={newArrivals:[regular],upcomingSales:[preorder,{...preorder,name:'OTHER CATEGORY',category:'other'}]};
 for(const html of [render(data,'/collection-'+category,templates).body,context.collectionGroupsHTML([regular,preorder],p=>'<article>'+p.name+'</article>')]){
  const current=html.match(/<section class="collection-current">([\s\S]*?)<\/section>/)[1],drops=html.match(/<section class="collection-preorders"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(current,/CURRENT ITEM/);assert.doesNotMatch(current,/FUTURE ITEM/);assert.match(drops,/FUTURE ITEM/);assert.doesNotMatch(drops,/CURRENT ITEM|OTHER CATEGORY/);
 }
 const html=render(data,'/collection-'+category,templates).body;
 assert.match(html,/preorder-badge">PREORDER/);assert.match(html,/Preorder €60.00/);assert.match(html,/Save €10.00/);assert.match(html,/2 December 2099/);
 for(const items of [[regular],[preorder],[]]){
  const h=context.collectionGroupsHTML(items,p=>p.name);assert.equal(h.includes('collection-preorders'),items.some(p=>p.isPreorder));assert.equal(h.includes('CURRENT ITEM'),items.includes(regular));assert.equal(h.includes('FUTURE ITEM'),items.includes(preorder));
 }
}
console.log('PASS category-specific preorder separation, no duplication, regular-only/preorder-only/empty groups, and server-rendered badge/prices/dispatch.');
