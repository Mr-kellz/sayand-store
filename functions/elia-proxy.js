'use strict';
const crypto=require('node:crypto');
const {hash,text}=require('./store-services');
const {catalogueReply}=require('./elia-catalogue');
const {generalPromotionPolicy}=require('./elia-promotions');
const assistance=require('./elia-assistance');
const {wrap}=require('./elia-requests');
// Only complete, narrowly scoped policy questions bypass the private-order guard.
// Do not exempt a message merely because it contains "policy", "how" or "can I":
// a second clause could request private data or an actual action.
function isPrivateOrderRequest(message) {
 const question=message.toLowerCase().replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
 const policyQuestions=[
  // Explicit whitespace after order; whole-message anchors reject appended requests.
  /^(?:can|may) i (?:cancel|return) (?:my|an|the) order(?:\s+(?:after|before) (?:it (?:has|has been|is)|it's|its) (?:shipped|delivered|delivery|shipment)| (?:after|before) (?:shipping|shipment|delivery))?\??$/,
  /^how (?:do|can) i (?:request|apply for) (?:a refund|a return|a cancellation)(?: for (?:my|an|the) order)?\??$/,
  /^how (?:do|can) i (?:cancel|return) (?:my|an|the) order[?.]?$/,
  /^(?:please )?(?:show|explain|tell) me (?:your|sayand's|the) (?:return|refund|cancellation|shipping|payment) policy[?.]?$/,
  /^can you check whether return shipping is free[?.]?$/,
  /^what (?:is|are) (?:your|sayand's|the) (?:order )?(?:cancellation|refund|return|shipping|delivery|payment|tracking) (?:policy|policies|process|rules)\??$/
 ];
 if(assistance.harmless(message)||generalPromotionPolicy(question)||policyQuestions.some(pattern=>pattern.test(question)))return false;
 const italianPrivate=/\b(?:mio|mia|miei|mie|suo|sua|cliente)\b/.test(question)&&/\b(?:ordin[ei]|indirizz[oi]|pagament[oi]|tracking|dati|carta|fattur[ae])\b/.test(question);
 const italianAction=/\b(?:mostra|recupera|annulla|rimborsa|modifica|cancella|invia)\b/.test(question)&&/\b(?:ordin[ei]|indirizz[oi]|pagament[oi]|tracking|dati|rimborso|cliente)\b/.test(question);
 const personal=/\b(?:my|mine|our|his|her|their|customer'?s?)\b/.test(question);
 const orderData=/\b(?:orders?|cancel|refund|returns?|address(?:es)?|payments?|tracking|shipment|package|parcel|card|invoice|receipt|customer|details|records)\b/.test(question);
 const identifier=/\b(?:order\s*(?:#|number|id)|tracking\s*(?:number|code)|payment\s*(?:id|details)|shipping address|billing address)\b/.test(question);
 const action=/\b(?:cancel|refund|change|update|delete|track|locate|retrieve|look up|show|check|find|send|give|process|approve|issue)\b/.test(question);
 return italianPrivate || italianAction || (personal && orderData) || identifier || (action && orderData);
}
// App-specific configuration must be verified in the existing Dify app before enabling.
function install(functions,s) {
 const {db,rate,fail}=s;
 const handler=async(d,c)=>{
  if(process.env.ELIA_ENABLED!=='true' || process.env.DIFY_APP_MODE!=='advanced-chat' || !process.env.DIFY_ELIA_API_KEY)fail('unavailable','Elia is being configured. Please contact support@thesayand.com.');
  const message=text(d?.message,2001);if(!message || message.length>2000)fail('invalid-argument','Please keep your message under 2,000 characters.');
  try{await rate('elia-ip:'+c.rawRequest.ip,20,3600000);await rate('elia-global',300,86400000);}catch(e){console.warn('Elia request gate failed',e.code==='resource-exhausted'?'rate-limit':'database-or-service');throw e;}
  // Order access/actions remain outside AI regardless of model instructions.
  if(isPrivateOrderRequest(message)){
   const safe=[];
   // Split only independent clauses; never forward the original mixed request to Dify.
   for(const part of message.split(/(?:[?!;]|\.(?:\s|$)|\s+(?:and|also)\s+(?=(?:show|track|cancel|refund|retrieve|give|tell|what|how)\b))/i)){
    const q=part.trim();if(!q||isPrivateOrderRequest(q))continue;
    if(/[^\s@]+@[^\s@]+\.[^\s@]+/.test(q)||/\b(?:\d[ -]?){12,19}\b/.test(q))continue;
    let fact=assistance.operational(q)||assistance.arithmetic(q,false);if(!fact){try{fact=await assistance.answer(db,q);}catch{}}if(fact)safe.push(fact.answer);
   }
   return {answer:[...new Set(safe),'For private order information or actions, use My Account → Orders. I cannot access or change orders.'].join('\n'),conversationToken:null};
  }
  if(/[^\s@]+@[^\s@]+\.[^\s@]+/.test(message) || /\b(?:\d[ -]?){12,19}\b/.test(message))fail('invalid-argument','Please remove personal details and payment information. Elia answers public shopping questions.');
  let token=typeof d.conversationToken==='string'?d.conversationToken:'',record;
  if(token){if(!/^[a-f0-9]{64}$/.test(token))fail('permission-denied','Start a new conversation.');record=(await db.ref('_eliaConversations/'+hash(token)).once('value')).val();if(!record || record.expires<Date.now() || record.owner!==(c.auth?.uid || 'guest'))fail('permission-denied','Start a new conversation.');}
  else {token=crypto.randomBytes(32).toString('hex');record={owner:c.auth?.uid || 'guest',providerUser:crypto.randomBytes(24).toString('hex'),expires:Date.now()+86400000};await db.ref('_eliaConversations/'+hash(token)).set(record);}
  // Guest token is an unguessable bearer capability, kept only in this browser tab's memory.
  const ref=db.ref('_eliaConversations/'+hash(token));
  const lock=await ref.child('busyUntil').transaction(v=>!v || v<Date.now()?Date.now()+60000:undefined);
  if(!lock.committed)fail('resource-exhausted','Please wait for the current reply.');
  let failureStage='conversation-rate';
  try {
   await rate('elia-conversation:'+hash(token),30,86400000);
   const inputs=JSON.parse(process.env.DIFY_ELIA_INPUTS_JSON || '{}');
   if(!inputs || Array.isArray(inputs) || typeof inputs!=='object')fail('failed-precondition','Elia configuration needs review.');
   if(require('./elia-engine.json').mode==='semantic-v1'){
    failureStage='semantic-conversation';
    const engine=require('./elia-semantic');
    const provider=require('./elia-provider'),deadline=Date.now()+45000;
    const result=await engine.respond({db,record,message,inputs,request:async(contextInputs,phase)=>{
     try{return await provider.request(timeout=>fetch('https://api.dify.ai/v1/chat-messages',{method:'POST',headers:{Authorization:'Bearer '+process.env.DIFY_ELIA_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({inputs:contextInputs,query:message,user:record.providerUser,conversation_id:'',response_mode:'blocking',auto_generate_name:false}),signal:AbortSignal.timeout(timeout)}),{deadline});}
     catch(e){console.warn('Elia semantic upstream',phase,e.code==='resource-exhausted'?'rate-limited':'unavailable');fail(e.code==='resource-exhausted'?'resource-exhausted':'unavailable',e.code==='resource-exhausted'?e.message:'Elia is temporarily unavailable. Please try again later.');}
    }});
    await ref.update({publicTurns:engine.remember(record,message,result),updatedAt:Date.now()});
    return {...result,conversationToken:token};
   }
   failureStage='dify-request';
   const response=await fetch('https://api.dify.ai/v1/chat-messages',{method:'POST',headers:{Authorization:'Bearer '+process.env.DIFY_ELIA_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({inputs,query:message,user:record.providerUser,conversation_id:record.conversationId || '',response_mode:'blocking'}),signal:AbortSignal.timeout(45000)});
   if(!response.ok){let difyCode='unknown';
try {
 const error=await response.json();
 if(typeof error?.code==='string' && /^[a-zA-Z_]{1,64}$/.test(error.code))
  difyCode=error.code;
} catch {}
console.error('Elia upstream error:',response.status,difyCode);if(response.status===429)fail('resource-exhausted','Elia is busy right now. Please wait before asking again; your question is saved.');fail('unavailable','Elia is temporarily unavailable. Please try again later.');}
   failureStage='dify-response';
   const result=await response.json();if(typeof result.answer!=='string' || typeof result.conversation_id!=='string')fail('unavailable','Elia returned an unexpected reply.');
   failureStage='conversation-save';
   await ref.update({conversationId:result.conversation_id,updatedAt:Date.now()});
   let verified;
   try{verified=await assistance.answer(db,message,record.publicContext||{}) || await catalogueReply(db,message);}catch{console.warn('Elia live store lookup failed');verified={catalogueVerified:true,products:[],answer:'I can’t verify those live details just now. Please try again shortly.'};}
   await ref.update({publicContext:verified?.context || require('./elia-context').remember(message,null,record.publicContext||{},{question:message})});
   return {...(verified || {answer:result.answer.slice(0,12000)}),conversationToken:token};
  }catch(e){console.error('Elia failure stage:',failureStage);if(e instanceof functions.https.HttpsError)throw e;console.error('Elia unavailable',e.name);fail('unavailable','Elia is temporarily unavailable. Please try again later.');}
  finally {await ref.child('busyUntil').remove();}
 };
 return functions.runWith({secrets:['DIFY_ELIA_API_KEY'],enforceAppCheck:true,maxInstances:5,timeoutSeconds:60}).https.onCall(wrap(handler,s,m=>isPrivateOrderRequest(m)||/[^\s@]+@[^\s@]+\.[^\s@]+/.test(m)||/\b(?:\d[ -]?){12,19}\b/.test(m)));
}
module.exports={install,isPrivateOrderRequest};
