'use strict';
const assert=require('node:assert/strict'),{install}=require('../functions/return-service');
const id='-'+'4'.repeat(19),secret='PRIVATE-CUSTOMER-FILENAME-TOKEN';
let storageError=null,rateError=null,readError=null,signs=0,rateCalls=0;
const value={userId:'owner',returnCase:{attachments:{a:{status:'ready',path:'return-evidence/owner/'+id+'/'+secret}}}};
const fail=(code,m)=>{throw Object.assign(Error(m),{code});};
const api=install({storage:()=>({bucket:()=>({file:()=>({getSignedUrl:async options=>{signs++;assert.equal(options.version,'v4');assert.equal(options.action,'read');assert.equal(options.responseDisposition,'attachment');assert(options.expires>Date.now()&&options.expires<=Date.now()+120000);if(storageError)throw storageError;return ['https://example.test/'+secret];}})})})},{call:f=>f,db:{ref:()=>({once:async()=>{if(readError)throw readError;return {val:()=>value};}})},uid:c=>c.auth?.uid||fail('unauthenticated','Sign in'),fail,rate:async()=>{rateCalls++;if(rateError)throw rateError;},ADMIN:'admin'});
const logs=[],original=console.error;console.error=(...x)=>logs.push(x);
(async()=>{const req={orderId:id,attachmentId:'a'};
for(const uid of ['owner','admin'])assert((await api.viewReturnEvidence(req,{auth:{uid}})).url.includes(secret));assert.equal(logs.length,0);
for(const [message,code,reason] of [
 ['Permission iam.serviceAccounts.signBlob denied '+secret,403,'signing-permission-denied'],
 ['IAM API has not been used or is disabled '+secret,403,'service-api-disabled'],
 ['Cannot sign data without client_email '+secret,undefined,'signing-credentials-unavailable'],
 ['Forbidden '+secret,403,'permission-denied'],
 ['Not found '+secret,404,'resource-not-found'],
 ['Network '+secret,'ETIMEDOUT','connectivity-or-timeout'],
 [secret,secret,'unclassified']]){storageError=Object.assign(Error(message),{code});await assert.rejects(api.viewReturnEvidence(req,{auth:{uid:'owner'}}),e=>e===storageError);assert.equal(logs.at(-1)[1].stage,'signed-link');assert.equal(logs.at(-1)[1].reason,reason);}
storageError=null;const previous=signs;await assert.rejects(api.viewReturnEvidence(req,{auth:{uid:'other'}}),e=>e.code==='permission-denied');assert.equal(signs,previous);assert.equal(logs.at(-1)[1].stage,'order-access');
rateError=Object.assign(Error(secret),{code:'resource-exhausted'});await assert.rejects(api.viewReturnEvidence(req,{auth:{uid:'owner'}}),e=>e===rateError);assert.equal(signs,previous);assert.equal(logs.at(-1)[1].stage,'rate-limit');rateError=null;
await assert.rejects(api.viewReturnEvidence({...req,attachmentId:'missing'},{auth:{uid:'owner'}}),e=>e.code==='permission-denied');assert.equal(signs,previous);assert.equal(logs.at(-1)[1].stage,'attachment-validation');
readError=Object.assign(Error(secret),{code:'ECONNRESET'});await assert.rejects(api.viewReturnEvidence(req,{auth:{uid:'owner'}}),e=>e===readError);assert.equal(logs.at(-1)[1].stage,'order-access');
assert(!JSON.stringify(logs).includes(secret));assert(!JSON.stringify(logs).includes(id));assert(!JSON.stringify(logs).includes('https://'));console.error=original;console.log('PASS actual evidence handler: sanitized failure stages/reasons, identical errors rethrown, no private data logged, owner/admin access and rate limits preserved');
})().catch(e=>{console.error=original;console.error(e);process.exitCode=1;});
