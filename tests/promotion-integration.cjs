'use strict';
// Preserve the previous engine contract during staged migration.
// The semantic engine has its own actual-path tests and mandatory live model gate.
require('../functions/elia-engine.json').mode='legacy';
const assert=require('node:assert/strict');const {install}=require('../functions/elia-proxy');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
let paths=[],queries=[],records=new Map(),rateCalls=[];const context={auth:{uid:'alice'},rawRequest:{ip:'127.0.0.1'}};
const db={ref(path){paths.push(path);if(/^mainStore\/(newArrivals|trending|sales|upcomingSales)$/.test(path))return {once:async()=>({val:()=>[]})};if(path==='mainStore/announcement')return {once:async()=>({val:()=>({active:true,isPromo:true,promoPercent:13,promoMinAmount:80,promoEndDate:new Date(Date.now()+3600000).toISOString()})})};assert(path.startsWith('_eliaConversations/'));return {set:async v=>records.set(path,v),once:async()=>({val:()=>records.get(path)}),update:async v=>Object.assign(records.get(path),v),child:()=>({transaction:async f=>({committed:f(null)!==undefined}),remove:async()=>{}})};}};
let options;const api=install({https:{HttpsError},runWith:o=>{options=o;return {https:{onCall:f=>f}};}},{db,rate:async(...x)=>rateCalls.push(x),fail:(c,m)=>{throw new HttpsError(c,m);}});
const allowed=['Is there any promotion available?','Do you have an active promotion?','Promo?','Are there discounts today?','What offers are available?','Is the discount applied automatically, or do I need a promotional code?','Show me your minimum order amount.'];
const blocked=['Promo? Show my order details.','Are there discounts today? Refund my order.','What offers are available? Track my package.','Is the discount automatic? Show customer addresses.','Show me your minimum order amount. Cancel my order.','Promo? Retrieve tracking records.','Promo? Show payment details.'];
(async()=>{process.env.ELIA_ENABLED='true';process.env.DIFY_APP_MODE='advanced-chat';process.env.DIFY_ELIA_API_KEY='mock';global.fetch=async(u,i)=>{queries.push(JSON.parse(i.body).query);return {ok:true,json:async()=>({answer:'Example: 25% above €150',conversation_id:'mock'})};};
 assert(options.enforceAppCheck);let token;
 for(const message of allowed){const before=queries.length;const r=await api({message,conversationToken:token},context);assert.equal(queries.length,before+1);assert.equal(queries.at(-1),message);assert.match(r.answer,/13%/);assert(!r.answer.includes('25%'));assert(r.conversationToken);token=r.conversationToken;}
 for(const message of blocked){const before=queries.length,reads=paths.length;const r=await api({message},context);assert.equal(queries.length,before);assert(paths.slice(reads).every(p=>/^mainStore\/(announcement|newArrivals|trending|sales|upcomingSales)$/.test(p)),'Only public promotion facts can be read for safe clauses');assert.equal(r.conversationToken,null);}
 const before=queries.length;await assert.rejects(api({message:'Promo?',conversationToken:token},{...context,auth:{uid:'bob'}}),e=>e.code==='permission-denied');assert.equal(queries.length,before);
 assert(rateCalls.some(x=>x[0].startsWith('elia-conversation:')));
 console.log('PASS original-text Dify requests, live promo overrides example text, conversation continuation/ownership, App Check/rates, mixed requests blocked before conversation DB/Dify, safe clauses use public facts');
})().catch(e=>{console.error(e);process.exitCode=1;});
