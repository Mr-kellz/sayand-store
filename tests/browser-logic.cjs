'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const paths=[],data={'newArrivals':{a:{name:'Hat',price:20,quantity:4,privateToken:'secret'}}};
const context={window:{},console,fetch:async()=>({ok:true,json:async()=>({lookbook:[],footer:{about:{title:'About',content:'SAYAND'}}})}),firebase:{database:()=>({ref:path=>{paths.push(path);return {once:async()=>({val:()=>data[path.replace('mainStore/','')] || null}),on:()=>{}};}})}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/public-store.js'),'utf8'),context);
(async()=>{const snap=await context.window.SayandPublicStore.once();assert(!paths.includes('mainStore'));assert(!paths.includes('mainStore/footer'));assert(!paths.some(p=>/discountCodes|users|subscribers/.test(p)));assert.equal(snap.val().newArrivals[0].name,'Hat');assert.equal(snap.val().newArrivals[0].privateToken,undefined);assert.equal(snap.val().footer.about.title,'About');console.log('PASS public browser adapter uses allowed child reads, preserves array shape, and excludes private product fields');})().catch(e=>{console.error(e);process.exitCode=1;});
