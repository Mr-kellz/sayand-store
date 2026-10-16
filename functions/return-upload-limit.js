'use strict';
const {hash}=require('./store-services');
const WINDOW=86400000;
function limits(owner){return [['return-upload:'+owner,12],['return-upload-global',200]];}
async function retryAt(db,owner,now=Date.now()) {
 let until=0;
 for(const [key,max] of limits(owner)){
  const value=(await db.ref('_serviceLimits/'+hash(key)).once('value')).val();
  if(value&&value.count>=max&&Number.isFinite(value.until)&&value.until>now)until=Math.max(until,value.until);
 }
 return until||null;
}
async function check(db,owner,fail){
 const until=await retryAt(db,owner);
 if(until)fail('resource-exhausted','The upload limit has been reached. Please try again after '+new Date(until).toISOString()+'. You can still send a message.');
}
async function consume(db,owner,rate,fail){
 // Preflight avoids consuming the customer allowance when the global allowance is full.
 // The existing atomic limiter remains authoritative, including concurrent requests.
 await check(db,owner,fail);
 try{for(const [key,max] of limits(owner))await rate(key,max,WINDOW);}
 catch(e){if(e.code==='resource-exhausted')await check(db,owner,fail);throw e;}
}
module.exports={retryAt,check,consume};
