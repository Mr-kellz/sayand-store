'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildQuote}=require('../functions/checkout-security');
const uid='test-owner',now=Date.now(),product={name:'Dress',price:40,quantity:5,sizes:['OS'],colors:['Default']};
const order={userId:uid,status:'Pending',items:[{name:'Dress',size:'OS',color:'Default',quantity:1}],shippingInfo:{firstName:'Test',email:'test@example.test',address:'Test street',city:'Test',zip:'00000',country:'Italy'}};
for(const flag of ['isHidden','isDraft','isPreorder','isOutOfStock'])assert.throws(()=>buildQuote({mainStore:{newArrivals:[{...product,[flag]:true}]}},order,'id',uid,now),/not available/);
assert.equal(buildQuote({mainStore:{newArrivals:[product]}},order,'id',uid,now).totalAmount,45);
console.log('PASS trusted checkout rejects hidden/draft/preorder/out-of-stock while normal checkout price stays unchanged');
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
let history={},entry={value:10,maxUses:1,uses:0};
const db={ref(p){return {once:async()=>{const v=p==='orders'?history:p==='mainStore/discountCodes/TEST'?entry:null;return {val:()=>v,exists:()=>v!==null};},orderByChild(){return this;},equalTo(){return this;},transaction:async()=>({committed:true})};}};
const functions={https:{HttpsError},runWith:()=>({https:{onCall:f=>f,onRequest:f=>f}})};
const api=require('../functions/store-services').install(functions,{database:()=>db},async()=>{}).exports;
const c={auth:{uid},rawRequest:{ip:'test'}};
const source=fs.readFileSync(path.join(__dirname,'../js/admin.js'),'utf8');const launch=source.slice(source.indexOf('let dropLaunchInProgress'),source.indexOf('function loadAnnouncementForm'));
async function launchTest(answers,{saveFails=false,duplicate=false}={}) {
 let saves=0,emails=0,updates=null;const paths=[],alerts=[];
 const data={newArrivals:duplicate?[{name:'TEST.DRESS'}]:[],upcomingSales:[{name:'TEST.DRESS',price:40,sizes:['S','M'],image:'https://example.test/image.jpg'}]};
 const context={window:{},database:data,prompt:()=>answers.shift(),confirm:()=>true,alert:m=>alerts.push(m),saveStoreSafely:async()=>{saves++;if(saveFails)throw Error('Conflict');},notifySubscribers:async()=>{emails++;},showAdminToast(){},renderLists(){},firebase:{database:{ServerValue:{TIMESTAMP:1}}},db:{ref(p){paths.push(p);return {once:async()=>({val:()=>({a:{size:'S'},b:{size:'M'}})}),update:async v=>{updates=v;}};}}};
 vm.createContext(context);vm.runInContext(launch,context);await context.window.launchDrop(0);return {data,saves,emails,updates,paths,alerts};
}
(async()=>{
 for(const status of ['Pending','Canceled (By User)','Canceled','Cancelled','Verifying']){history={old:{status,promoCodeUsed:'TEST'}};assert.equal((await api.validatePromo({code:'TEST'},c)).valid,true,status);}
 for(const status of ['Paid','Shipped','Delivered']){history={old:{status,paymentDate:1,promoCodeUsed:'TEST'}};assert.equal((await api.validatePromo({code:'TEST'},c)).valid,false,status);}
 history={};entry={value:10,maxUses:1,uses:1};assert.equal((await api.validatePromo({code:'TEST'},c)).valid,false);
 console.log('PASS unpaid cancelled orders do not consume promo; paid redemptions and global usage limits still block reuse');
 const ok=await launchTest(['3','0']);assert.equal(ok.data.newArrivals[0].quantity,3);assert.equal(ok.data.newArrivals[0].sizeQuantities.S,3);assert.equal(ok.data.newArrivals[0].sizeQuantities.M,0);assert.equal(Object.values(ok.updates).length,1);assert.equal(Object.values(ok.updates)[0].maxStock,3);assert(ok.paths.includes('preorders/TEST_DRESS'));assert.equal(ok.emails,1);
 for(const input of [[null],[''],['-2'],['1.5'],['1000001'],['0','0']]){const r=await launchTest(input);assert.equal(r.saves,0);assert.equal(r.emails,0);assert.equal(r.data.newArrivals.length,0);}
 const duplicate=await launchTest(['2','2'],{duplicate:true});assert.equal(duplicate.saves,0);
 const fail=await launchTest(['2','2'],{saveFails:true});assert.equal(fail.data.newArrivals.length,0);assert.equal(fail.data.upcomingSales.length,1);assert.equal(fail.emails,0);
 console.log('PASS drop uses real per-size stock; rejects invalid/cancelled/zero input and duplicates; failed save rolls back without notifications');
 const logs=fs.readFileSync(path.join(__dirname,'../functions/index.js'),'utf8').split('\n').filter(l=>/console\.(log|warn|error)/.test(l)).join('\n');
 for(const forbidden of ['userEmail','user.email','birthdayCode','JSON.stringify(results)','templateErr.message','err.message','e.message','error.message','${chatId}','${uid}'])assert(!logs.includes(forbidden),forbidden);
 console.log('PASS notification logs omit customer emails, promo codes, recipient lists and raw provider error bodies');
})().catch(e=>{console.error(e);process.exitCode=1;});
