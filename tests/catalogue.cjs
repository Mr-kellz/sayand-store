'use strict';
const assert=require('node:assert/strict');
const {render,products,number}=require('../functions/catalogue');
const {query}=require('../functions/shop-query');
const {evidenceType}=require('../functions/upload-validation');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture={newArrivals:[{name:'BUBU GOWN 3',price:40,salePrice:20,saleEndDate:'2099-01-01',quantity:2,sizes:['OS'],sizeQuantities:{OS:2},colors:['Red'],category:'women',privateMetadata:'SECRET'},{name:'Hat',price:30,quantity:0,category:'accessories'},{name:'Cap',price:null,quantity:null,category:'accessories'},{name:'VIP',price:50,isVipOnly:true},{name:'Draft',isDraft:true}],trending:[],sales:[]};
const templates={product:'<html><head><title>Original</title></head><body></body></html>',collection:'<html><head><title>Original</title></head><body></body></html>',notFound:'Not found'};
let count=0;function test(label,fn){fn();console.log('PASS '+label);count++;}
test('missing/malformed values are unknown, not free stock',()=>{for(const v of [null,undefined,'',' ',false,[],{},'bad',-1])assert.equal(number(v),null);assert.equal(number('20'),20);assert.equal(number(0),0);});
test('new product immediately gets route and sitemap entry',()=>{let d=structuredClone(fixture);d.sales.push({name:'New Scarf',price:15,quantity:1});assert.equal(render(d,'/product-new-scarf',templates).status,200);assert.match(render(d,'/sitemap.xml',templates).body,/product-new-scarf/);});
test('deleted product returns real 404 and leaves sitemap',()=>{let d=structuredClone(fixture);d.newArrivals.shift();assert.equal(render(d,'/product-bubu-gown-3',templates).status,404);assert.doesNotMatch(render(d,'/sitemap.xml',templates).body,/product-bubu-gown-3/);});
test('out-of-stock page remains and hidden/VIP products excluded',()=>{assert.equal(render(fixture,'/product-hat',templates).status,200);assert.equal(render(fixture,'/product-vip',templates).status,404);assert.equal(products(fixture).length,3);});
test('metadata escaped, product/category names and links rendered server-side',()=>{let d={newArrivals:[{name:'Red <Hat>',description:'<script>bad</script> Nice hat',price:4,category:'accessories'}]};let p=products(d)[0];const html=render(d,p.route,templates).body;assert.match(html,/Red &lt;Hat&gt;/);assert.doesNotMatch(html,/<script>bad/);assert.match(render(d,'/collection-accessories',templates).body,/product-red-hat/);});
test('slug collisions produce distinct, deterministic URLs',()=>{let d={newArrivals:[{name:'Hat A'},{name:'Hat_A'}]};assert.equal(new Set(products(d).map(p=>p.route)).size,2);assert.deepEqual(products(d),products({newArrivals:[...d.newArrivals].reverse()}));});
test('plural search and combined budget filters respect product terms',()=>{assert.equal(query(fixture,{question:'hats'}).products[0].name,'Hat');assert.equal(query(fixture,{question:'hats under 25 euros'}).count,0);assert.equal(query(fixture,{question:'gowns under 25 euros'}).products[0].price,20);});
test('expired sales and unknown stock are not invented availability',()=>{let d=structuredClone(fixture);d.newArrivals[0].saleEndDate='2000-01-01';assert.equal(query(d,{question:'gown'}).products[0].price,40);assert.equal(query(d,{question:'available caps'}).count,0);});
test('duplicate catalogue entries cannot advertise conflicting price/stock',()=>{let d=structuredClone(fixture);d.sales.push({...d.newArrivals[0],price:1});const p=query(d,{question:'gown'}).products[0];assert.equal(p.price,null);assert.equal(p.inStock,false);assert.equal(p.catalogueConflict,true);});
test('public response contains no private fields or raw IDs',()=>{const str=JSON.stringify(query(fixture,{question:''}));assert.doesNotMatch(str,/SECRET|privateMetadata|"id":|isVipOnly/);});
test('size-specific availability and color filtering',()=>{let d=structuredClone(fixture);d.newArrivals[0].sizeQuantities.OS=0;assert.equal(query(d,{question:'available gown',size:'OS'}).count,0);assert.equal(query(d,{question:'gown',color:'blue'}).count,0);});
test('uploaded HTML/SVG rejected even when claiming image',()=>{assert.equal(evidenceType(Buffer.from('<svg><script>alert(1)</script></svg>')),null);assert.equal(evidenceType(Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(30)])).mime,'image/jpeg');});
test('all shipped browser and backend JavaScript parses',()=>{
 const root=path.resolve(__dirname,'..');for(const dir of ['js','functions'])for(const file of fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.js'))){const s=fs.readFileSync(path.join(root,dir,file),'utf8');if(/^import /m.test(s))continue;new vm.Script(s,{filename:dir+'/'+file});}
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html')&&!/^(product-|collection-)/.test(f))){const s=fs.readFileSync(path.join(root,file),'utf8');for(const m of s.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)){if(/src=|application\/ld\+json|type=["']module/.test(m[1]))continue;new vm.Script(m[2],{filename:file});}}
});
console.log('TOTAL '+count+' checks passed');
