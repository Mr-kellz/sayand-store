'use strict';
const crypto = require('node:crypto');
const ADMIN = 'MS15g8h5ELPmMcuBijhEC7loGws2';
const hash = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const text = (v,max=200) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const email = v => { const e=text(v,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; };
function install(functions,admin,sendEmail) {
 const db=admin.database(), ErrorType=functions.https.HttpsError;
 const fail=(code,message)=>{throw new ErrorType(code,message);};
 const uid=c=>c.auth?.uid || fail('unauthenticated','Please sign in.');
 async function rate(key,max,windowMs) {
  const now=Date.now(), ref=db.ref('_serviceLimits/'+hash(key));
  const r=await ref.transaction(v=>{if(!v || v.until<now)return {count:1,until:now+windowMs};if(v.count>=max)return;return {...v,count:v.count+1};});
  if(!r.committed)fail('resource-exhausted','Too many requests. Please try again later.');
 }
 const call=fn=>functions.runWith({enforceAppCheck:true,maxInstances:10,timeoutSeconds:60}).https.onCall(async(d,c)=>{try{return await fn(d || {},c);}catch(e){if(e instanceof ErrorType)throw e;console.error('Store service failed',e.code || 'internal');fail('internal','Unable to complete the request. Please try again.');}});
 const mail=(to,templateId,params)=>sendEmail({sender:{name:'SAYAND',email:'noreply@thesayand.com'},to:[{email:to}],templateId,params});
 async function ensureProfile(d,c) {
  const id=uid(c), user=await admin.auth().getUser(id);
  if(!user.email)fail('failed-precondition','An email address is required.');
  const r=db.ref('users/'+id), old=(await r.once('value')).val() || {};
  const first=text(d.firstName || old.firstName || user.displayName?.split(' ')[0] || 'Member',80);
  const last=text(d.lastName || old.lastName || '',80);
  const data={firstName:first,lastName:last,email:user.email,createdAt:old.createdAt || Date.now(),accountVerified:user.emailVerified || old.accountVerified === true,welcomeEmailSent:old.welcomeEmailSent === true,referralCode:old.referralCode || 'SAYAND'+hash(id).slice(0,12).toUpperCase()};
  if(/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth || '') && !old.dateOfBirth)data.dateOfBirth=d.dateOfBirth;
  if(!old.createdAt && text(d.referralCode)) {
   const code=text(d.referralCode,40).toUpperCase();
   const users=(await db.ref('users').orderByChild('referralCode').equalTo(code).limitToFirst(2).once('value')).val() || {};
   const ids=Object.keys(users).filter(other=>other!==id && email(users[other].email)!==email(user.email));
   if(ids.length===1)data.referredBy=ids[0];
  }
  await r.update(data); return {verified:data.accountVerified};
 }
 async function rewardReferral(id) {
  const u=(await db.ref('users/'+id).once('value')).val();
  if(!u?.accountVerified || !u.referredBy || u.referredBy===id || u.referralRewardsGranted)return;
  const other=(await db.ref('users/'+u.referredBy).once('value')).val();
  if(!other || email(other.email)===email(u.email))return;
  const updates={};
  for(const [owner,prefix,label] of [[id,'WELCOME10-','Welcome Bonus'],[u.referredBy,'THANKS10-','Referral Bonus']]) {
   const code=prefix+hash(id+prefix).slice(0,16).toUpperCase();
   await db.ref('mainStore/discountCodes/'+code).transaction(v=>v || {value:10,maxUses:1,uses:0});
   updates['users/'+owner+'/rewards/'+code]={amount:'10% OFF',type:label,code};
  }
  updates['users/'+id+'/referralRewardsGranted']=true;await db.ref().update(updates);
 }
 const exports={};
 exports.ensureCustomerProfile=call(async(d,c)=>{await rate('profile:'+uid(c),20,3600000);return ensureProfile(d,c);});
 exports.validateReferral=call(async(d,c)=>{await rate('referral:'+c.rawRequest.ip,15,3600000);const code=text(d.code,40).toUpperCase();if(!code)return {valid:false};const s=await db.ref('users').orderByChild('referralCode').equalTo(code).limitToFirst(1).once('value');return {valid:s.exists()};});
 exports.requestVerification=call(async(d,c)=>{
  const id=uid(c);await rate('verify:'+id,4,3600000);await rate('verify-ip:'+c.rawRequest.ip,15,3600000);
  await ensureProfile({},c);const user=await admin.auth().getUser(id);if(user.emailVerified)return {verified:true};
  const code=crypto.randomInt(100000,1000000).toString(),salt=crypto.randomBytes(24).toString('hex');
  await db.ref('_emailVerification/'+id).set({hash:hash(salt+code),salt,email:user.email,expires:Date.now()+600000,attempts:0});
  const first=(await db.ref('users/'+id+'/firstName').once('value')).val();
  await mail(user.email,4,{firstName:first || 'there',verificationCode:code,supportEmail:'support@thesayand.com'});return {sent:true};
 });
 exports.verifyCustomerEmail=call(async(d,c)=>{
  const id=uid(c);await rate('verify-check:'+id,10,600000);if(!/^\d{6}$/.test(d.code || ''))fail('invalid-argument','Enter the six-digit code.');
  const ref=db.ref('_emailVerification/'+id),user=await admin.auth().getUser(id);
  const r=await ref.transaction(v=>{
   if(!v)return null;
   if(v.expires<Date.now() || v.attempts>=5 || v.email!==user.email || v.used)return;
   const matches=hash(v.salt+d.code)===v.hash;
   return {...v,attempts:v.attempts+1,used:matches};
  });
  if(!r.committed || !r.snapshot.val()?.used)fail('invalid-argument','The code is incorrect or expired.');
  await admin.auth().updateUser(id,{emailVerified:true});await db.ref('users/'+id).update({accountVerified:true,verificationCode:null});await rewardReferral(id);return {verified:true};
 });
 exports.subscribeNewsletter=call(async(d,c)=>{
  const address=email(d.email);if(!address)fail('invalid-argument','Enter a valid email address.');
  await rate('newsletter-ip:'+c.rawRequest.ip,4,3600000);await rate('newsletter-email:'+address,1,86400000);await rate('newsletter-global',100,3600000);
  // Generic response does not reveal subscription or account membership.
  const existing=await db.ref('subscribers').orderByChild('email').equalTo(address).limitToFirst(1).once('value');
  if(existing.exists())return {success:true};
  const token=crypto.randomBytes(32).toString('hex');await db.ref('_newsletterConfirm/'+hash(token)).set({email:address,firstName:text(d.firstName,80) || 'there',expires:Date.now()+86400000});
  const url='https://thesayand.com/newsletter-confirm?token='+token;
  await sendEmail({sender:{name:'SAYAND',email:'noreply@thesayand.com'},to:[{email:address}],subject:'Confirm your SAYAND subscription',htmlContent:'<p>Confirm that you want to receive SAYAND news and offers.</p><p><a href="'+url+'">Confirm subscription</a></p><p>If you did not request this, ignore this email.</p>'});
  return {success:true};
 });
 exports.confirmNewsletter=functions.runWith({maxInstances:5}).https.onRequest(async(req,res)=>{
  res.set('X-Robots-Tag','noindex').set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  const token=String(req.query.token || '');if(!/^[a-f0-9]{64}$/.test(token))return res.status(400).send('Invalid confirmation link.');
  if(req.method==='GET')return res.type('html').send('<!doctype html><title>SAYAND subscription</title><h1>SAYAND</h1><p>Receive SAYAND news and offers by email.</p><form method="post"><button>Confirm subscription</button></form>');
  if(req.method!=='POST')return res.status(405).send('Method not allowed');
  try {
   const r=await db.ref('_newsletterConfirm/'+hash(token)).transaction(v=>v === null ? null : v.expires>Date.now() && !v.used ? {...v,used:true}:undefined);
   if(!r.committed || !r.snapshot.val())return res.status(400).send('This confirmation link has expired or was already used.');
   const v=r.snapshot.val(), key=hash(v.email);
   const saved=await db.ref('subscribers/'+key).transaction(old=>old || {email:v.email,firstName:v.firstName,subscribedAt:Date.now(),source:'website',consent:{purpose:'newsletter',version:2,granted:true,recordedAt:Date.now(),doubleOptIn:true}});
   if(saved.committed)await mail(v.email,3,{firstName:v.firstName});
   return res.send('Thank you. Your SAYAND subscription is confirmed.');
  }catch(e){console.error('Newsletter confirmation failed',e.code || 'internal');return res.status(503).send('Please contact support@thesayand.com if confirmation did not complete.');}
 });
 exports.validatePromo=call(async(d,c)=>{
  const id=uid(c);await rate('promo:'+id,15,3600000);const code=text(d.code,80).toUpperCase();
  if(!/^[A-Z0-9_-]{2,80}$/.test(code))return {valid:false};
  if(code==='WELCOME10'&&!await require('./newsletter-eligibility').eligible(db,admin.auth(),id))return {valid:false,message:'WELCOME10 is for newsletter subscribers. Confirm your subscription using your verified account email.'};
  const [percent,fixed,expiry,orders]=await Promise.all(['mainStore/discountCodes/'+code,'mainStore/fixedCodes/'+code,'mainStore/discountCodeExpiry/'+code].map(p=>db.ref(p).once('value')).concat(db.ref('orders').orderByChild('userId').equalTo(id).once('value')));
  const entry=percent.exists()?percent.val():fixed.val(), value=Number(typeof entry==='object'?entry?.value:entry);
  const used=Object.values(orders.val() || {}).some(o=>require('./checkout-security').purchased(o) && String(o.promoCodeUsed || '').toUpperCase()===code);
  const valid=entry!=null && Number.isFinite(value) && value>0 && (!percent.exists() || value<=100) && (!expiry.val() || Number(expiry.val())>Date.now()) && !(entry.maxUses!=null && Number(entry.uses || 0)>=Number(entry.maxUses)) && !used && (!code.startsWith('BDAY') || code==='BDAY'+id.slice(-6).toUpperCase());
  return valid?{valid:true,type:percent.exists()?'percent':'fixed',value}:{valid:false};
 });
 exports.registerPreorder=call(async(d,c)=>{
  const id=uid(c);await rate('preorder:'+id,10,86400000);const {readCatalogue,products}=require('./catalogue');const p=products(await readCatalogue(db)).find(p=>p.name===text(d.productName));
  if(!p?.isPreorder)fail('failed-precondition','This item is not available for preorder.');
  const user=await admin.auth().getUser(id);const key=p.name.replace(/[.#$\[\]\/]/g,'_');
  await db.ref('preorders/'+key+'/'+id).set({uid:id,email:user.email,name:p.name,timestamp:Date.now(),size:text(d.size,80)});return {success:true};
 });
 exports.requestPasswordReset=call(async(d,c)=>{
  const address=email(d.email);if(!address)fail('invalid-argument','Enter a valid email address.');
  await rate('reset-ip:'+c.rawRequest.ip,5,3600000);await rate('reset-email:'+address,2,3600000);
  try {const raw=await admin.auth().generatePasswordResetLink(address);const code=new URL(raw).searchParams.get('oobCode');await mail(address,20,{resetLink:'https://thesayand.com/reset-password.html?oobCode='+encodeURIComponent(code)});}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  return {success:true};
 });
 exports.submitProductReview=call(async(d,c)=>{
  const id=uid(c);await rate('review:'+id,8,86400000);const user=await admin.auth().getUser(id);
  if(!user.emailVerified)fail('failed-precondition','Verify your email before posting a review.');
  const {products,readCatalogue}=require('./catalogue');const p=products(await readCatalogue(db)).find(p=>p.name===text(d.productName));
  if(!p)fail('not-found','Product unavailable.');
  const rating=Number(d.rating),body=text(d.text,2000).replace(/<[^>]*>/g,'');if(!Number.isInteger(rating)||rating<1||rating>5||body.length<3)fail('invalid-argument','Choose a rating and write a review.');
  const productKey=p.name.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
  const reviewKey=d.reviewId?text(d.reviewId,80):id;
  if(!/^[-A-Za-z0-9_]+$/.test(reviewKey))fail('invalid-argument','Invalid review.');
  const ref=db.ref('reviews/'+productKey+'/'+reviewKey),old=(await ref.once('value')).val();
  if(d.reviewId && (!old || old.userId!==id))fail('permission-denied','You can only edit your own review.');
  const profile=(await db.ref('users/'+id).once('value')).val() || {};
  await ref.set({userId:id,name:text(profile.firstName,80)||'Customer',rating,text:body,timestamp:Date.now()});return {success:true};
 });
 return {exports,rate,call,uid,fail,mail,db,ADMIN};
}
module.exports={install,hash,text,email,ADMIN};
