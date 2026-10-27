'use strict';
const {hash}=require('./store-services');
// Idempotent request receipts. Guest receipt IDs are unguessable bearer capabilities.
// An uncertain upstream outcome is never automatically reissued.
function wrap(handler,s,privateCheck){
 return async(d,c)=>{
  if(!d?.requestId)return handler(d,c);
  if(!/^[a-f0-9]{64}$/.test(d.requestId))s.fail('invalid-argument','Invalid request reference.');
  const statusOnly=d.operation==='status';
  if(!statusOnly&&privateCheck(d.message||''))return handler(d,c);
  await s.rate('elia-receipt:'+c.rawRequest.ip,60,3600000);
  const owner=c.auth?.uid||'guest',ref=s.db.ref('_eliaRequests/'+hash(d.requestId)),now=Date.now();
  const existing=(await ref.once('value')).val();
  const view=v=>{
   if(v.owner!==owner)s.fail('permission-denied','This request is not available.');
   if(!statusOnly&&v.messageHash!==hash(d.message||''))s.fail('permission-denied','Request text cannot change.');
   if(v.expires<now)return {requestStatus:'uncertain',answer:'This request has expired. It will not be sent again automatically.'};
   if(v.status==='retryable')return {requestStatus:'retryable',retryAt:v.retryAt,answer:'Elia is busy. Please wait '+Math.max(1,Math.ceil((v.retryAt-now)/1000))+' seconds, then tap Retry. Your question is saved.'};
   if(v.status==='done')return {...v.result,requestStatus:'done'};
   return {requestStatus:v.status==='pending'&&now-v.started<90000?'pending':'uncertain',answer:'The earlier reply could not be confirmed. It will not be sent again automatically. You can check again shortly or ask a new question.'};
  };
  if(existing){const current=view(existing);if(statusOnly||current.requestStatus!=='retryable'||existing.retryAt>now)return current;}
  if(statusOnly)return {requestStatus:'not_found'};
  const record={owner,messageHash:hash(d.message||''),started:now,expires:now+86400000,status:'pending'};
  const lock=await ref.transaction(v=>!v||(v.status==='retryable'&&v.retryAt<=now&&v.expires>=now&&v.owner===owner&&v.messageHash===record.messageHash)?record:undefined);
  if(!lock.committed)return view((await ref.once('value')).val());
  try{const result=await handler(d,c);await ref.update({status:'done',result});return {...result,requestStatus:'done'};}
  catch(e){if(e.safeToRetry===true&&e.code==='resource-exhausted'){const retryAt=Date.now()+Math.max(1000,e.retryAfterMs||30000);await ref.update({status:'retryable',retryAt});return view({...record,status:'retryable',retryAt});}await ref.update({status:'uncertain'}).catch(()=>{});throw e;}
 };
}
module.exports={wrap};
