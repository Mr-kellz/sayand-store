'use strict';
const crypto=require('node:crypto');
const {text}=require('./store-services');
const {evidenceType}=require('./upload-validation');
const uploadLimit=require('./return-upload-limit');
const WINDOW=30*24*60*60*1000;
const closed=v=>!!v && (['Approved','Declined','Refunded','Closed'].includes(v.status)||!!v.closedAt);
const eligible=(v,now=Date.now())=>v?.status==='Delivered'&&!v.returnCase&&typeof v.deliveredAt==='number'&&Number.isFinite(v.deliveredAt)&&v.deliveredAt>0&&v.deliveredAt<=now&&now-v.deliveredAt<=WINDOW;
function install(admin,s) {
 const {call,db,uid,fail,rate,ADMIN}=s;
 const idOf=d=>/^[-A-Za-z0-9_]{20}$/.test(d.orderId || '') ? d.orderId : fail('invalid-argument','Invalid order reference.');
 async function order(d,c) {
  const id=idOf(d), owner=uid(c), ref=db.ref('orders/'+id), value=(await ref.once('value')).val();
  if(!value || (owner!==ADMIN && value.userId!==owner))fail('permission-denied','This order is not available.');
  return {id,owner,ref,value,isAdmin:owner===ADMIN};
 }
 const exports={};
 exports.openOrderReturn=call(async(d,c)=>{
  const o=await order(d,c);await rate('return-open:'+o.owner,5,86400000);
  const reason=text(d.reason,80), detail=text(d.detail,2000), condition=text(d.condition,80);
  if(!['Size or fit','Damaged item','Wrong item','Changed my mind','Other'].includes(reason) || detail.length<10 || !['Unworn with tags','Opened or tried on','Damaged on arrival','Other'].includes(condition))fail('invalid-argument','Complete the reason, condition and description.');
  const result=await o.ref.transaction(v=>{
   if(!v)return null;
   if(v.userId!==o.owner || !eligible(v))return;
   const now=Date.now();return {...v,status:'Return Requested',returnCase:{createdAt:now,updatedAt:now,status:'Under review',reason,condition,messages:{initial:{role:'customer',text:detail,createdAt:now}}}};
  });
  if(!result.committed || !result.snapshot.val()?.returnCase)fail('failed-precondition','New return requests must be made within 30 days of the recorded delivery date. If the date is missing or you need other help, contact support@thesayand.com. An existing case cannot be reopened here.');
  return {success:true};
 });
 exports.getOrderReturn=call(async(d,c)=>{
  const o=await order(d,c);await rate('return-read:'+o.owner,200,3600000);
  return {case:o.value.returnCase || null,canRequest:eligible(o.value),isClosed:closed(o.value.returnCase),uploadsEnabled:process.env.RETURN_EVIDENCE_ENABLED!=='false',uploadRetryAt:await uploadLimit.retryAt(db,o.owner),returnDeadline:typeof o.value.deliveredAt==='number'?o.value.deliveredAt+WINDOW:null,isAdmin:o.isAdmin,orderStatus:o.value.status};
 });
 exports.replyOrderReturn=call(async(d,c)=>{
  const o=await order(d,c);await rate('return-reply:'+o.owner,30,3600000);
  const message=text(d.message,2000);if(!message)fail('invalid-argument','Write a message.');
  const key=crypto.randomBytes(12).toString('hex');const result=await o.ref.child('returnCase').transaction(v=>{
   if(!v)return null;
   if(closed(v)||Object.keys(v.messages || {}).length>=100)return;
   return {...v,updatedAt:Date.now(),messages:{...v.messages,[key]:{role:o.isAdmin?'SAYAND':'customer',text:message,createdAt:Date.now()}}};
  });
  if(!result.committed || !result.snapshot.val()?.messages?.[key])fail('failed-precondition','This conversation is closed or full. Please contact support@thesayand.com for further help.');return {success:true};
 });
 exports.reviewOrderReturn=call(async(d,c)=>{
  const o=await order(d,c);if(!o.isAdmin)fail('permission-denied','Administrator access required.');
  if(!['Approved','More information needed','Declined'].includes(d.decision))fail('invalid-argument','Choose a review decision.');
  const message=text(d.message,2000);if(message.length<10)fail('invalid-argument','Explain the decision and next steps.');
  const result=await o.ref.transaction(v=>{
   if(!v)return null;
   if(!v.returnCase || closed(v.returnCase))return;
   const now=Date.now();const key=crypto.randomBytes(12).toString('hex');
   return {...v,status:d.decision==='Approved'?'Return Approved':d.decision==='Declined'?'Return Declined':v.status,returnCase:{...v.returnCase,status:d.decision,...(d.decision==='More information needed'?{}:{closedAt:now}),updatedAt:now,messages:{...v.returnCase.messages,[key]:{role:'SAYAND',text:message,createdAt:now}}}};
  });
  if(!result.committed || !result.snapshot.val()?.returnCase)fail('failed-precondition','No return case found.');
  return {success:true,note:'Review saved. No Stripe refund has been issued.'};
 });
 exports.attachReturnEvidence=call(async(d,c)=>{
  const o=await order(d,c);if(!o.value.returnCase)fail('failed-precondition','Open a return request first.');
  if(closed(o.value.returnCase))fail('failed-precondition','This conversation is closed. No more files can be added.');
  if(process.env.RETURN_EVIDENCE_ENABLED==='false')fail('unavailable','Evidence uploads are being configured. You can still send a message.');
  if(typeof d.base64!=='string' || d.base64.length>5600000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(d.base64))fail('invalid-argument','Choose a file smaller than 4 MB.');
  const bytes=Buffer.from(d.base64,'base64'),type=evidenceType(bytes);
  if(bytes.length>4*1024*1024 || !type || (d.mime && type.mime!==d.mime))fail('invalid-argument','Use a JPEG, PNG, WebP, MP4 or WebM file under 4 MB. HEIC, PDF and other file types are not supported.');
  const attachment=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,32);
  const existing=o.value.returnCase.attachments?.[attachment];
  if(existing?.status==='ready')return {success:true,attachmentId:attachment,alreadySaved:true};
  if(existing)fail('failed-precondition','This file is still awaiting upload confirmation. Refresh the conversation before trying again.');
  if(Object.keys(o.value.returnCase.attachments||{}).length>=6)fail('failed-precondition','This case already contains six files.');
  await uploadLimit.consume(db,o.owner,rate,fail);
  const p='return-evidence/'+o.value.userId+'/'+o.id+'/'+attachment+'.'+type.ext;
  // A cold Firebase transaction may first receive null for an existing case.
  // Return null (not undefined) to let the server compare/retry; verify the committed slot.
  const reservation=await o.ref.child('returnCase').transaction(v=>{if(!v)return null;if(closed(v)||v.attachments?.[attachment]||Object.keys(v.attachments||{}).length>=6)return;return {...v,attachments:{...v.attachments,[attachment]:{path:p,status:'uploading',mime:type.mime,createdAt:Date.now(),name:text(d.name,100)}}};});
  const reserved=reservation.snapshot.val();
  if(!reservation.committed || reserved?.attachments?.[attachment]?.status!=='uploading'){
   if(!reserved)fail('failed-precondition','The return case is no longer available. Refresh the conversation.');
   if(closed(reserved))fail('failed-precondition','This return case is closed. No more files can be added.');
   if(reserved.attachments?.[attachment]?.status==='ready')return {success:true,attachmentId:attachment,alreadySaved:true};
   if(reserved.attachments?.[attachment])fail('failed-precondition','This file is still uploading. Refresh the conversation to check its confirmation.');
   if(Object.keys(reserved.attachments||{}).length>=6)fail('failed-precondition','This return case already contains six files.');
   fail('aborted','The upload could not reserve a file slot. Refresh the conversation and try again.');
  }
  try {
   await admin.storage().bucket().file(p).save(bytes,{resumable:false,metadata:{contentType:type.mime,cacheControl:'private, no-store',metadata:{purpose:'return-evidence'}}});
   const ready=await o.ref.child('returnCase').transaction(v=>{if(!v)return null;if(closed(v)||!v.attachments?.[attachment])return;return {...v,attachments:{...v.attachments,[attachment]:{...v.attachments[attachment],status:'ready'}}};});
   if(!ready.committed || ready.snapshot.val()?.attachments?.[attachment]?.status!=='ready')fail('failed-precondition','The case was closed during upload. The file was not added.');
  }catch(e){try{await admin.storage().bucket().file(p).delete({ignoreNotFound:true});}catch{}await o.ref.child('returnCase/attachments/'+attachment).remove().catch(()=>{});if(e.code==='failed-precondition')throw e;console.error('Return evidence storage failed',e.code||'unknown');fail('unavailable','The file was not saved. Please contact support if retrying fails. Reference: '+(/^[a-zA-Z0-9_/-]{1,50}$/.test(String(e.code))?e.code:'storage-error'));}
  return {success:true,attachmentId:attachment};
 });
 exports.viewReturnEvidence=call(async(d,c)=>{
  let stage='order-access';
  try {
   const o=await order(d,c);stage='rate-limit';await rate('return-file-read:'+o.owner,100,3600000);
   stage='attachment-validation';const a=o.value.returnCase?.attachments?.[text(d.attachmentId,40)];
   if(!a || a.status!=='ready' || !a.path.startsWith('return-evidence/'+o.value.userId+'/'+o.id+'/'))fail('permission-denied','File unavailable.');
   const preview=d.preview===true;
   if(preview&&!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(a.mime))fail('failed-precondition','Preview is unavailable for this file. Use Download instead.');
   stage='signed-link';const [url]=await admin.storage().bucket().file(a.path).getSignedUrl({version:'v4',action:'read',expires:Date.now()+120000,responseDisposition:preview?'inline':'attachment'});
   return preview?{url,mime:a.mime}:{url};
  } catch(e) {
   // Classify privately; never log raw messages, file paths, identities or signed URLs.
   const message=typeof e?.message==='string'?e.message.toLowerCase():'';
   const code=String(e?.code??'');
   const safeCode=/^(?:[1-9]|1[0-6]|[1-5][0-9]{2})$/.test(code)||['invalid-argument','unauthenticated','permission-denied','resource-exhausted','failed-precondition','unavailable','internal','ENOENT','ENOTFOUND','ECONNRESET','ETIMEDOUT'].includes(code)?code:'unclassified';
   let reason='unclassified';
   if(/service_disabled|has not been used|api.*disabled/.test(message))reason='service-api-disabled';
   else if(/signblob/.test(message)&&/denied|permission|forbidden/.test(message))reason='signing-permission-denied';
   else if(/cannot sign data|client_email|default credentials|could not load.*credentials/.test(message))reason='signing-credentials-unavailable';
   else if(code==='403'||code==='7'||code==='permission-denied'||/permission denied|access denied|forbidden/.test(message))reason='permission-denied';
   else if(code==='404'||code==='5'||code==='ENOENT')reason='resource-not-found';
   else if(code==='429'||code==='8'||code==='resource-exhausted')reason='rate-limited';
   else if(['ENOTFOUND','ECONNRESET','ETIMEDOUT'].includes(code)||/timed out|timeout/.test(message))reason='connectivity-or-timeout';
   else if(e instanceof TypeError)reason='invalid-data-or-type';
   console.error('Return evidence access failed',{stage,reason,code:safeCode});
   throw e;
  }
 });
 return exports;
}
module.exports={install,eligible,closed};
