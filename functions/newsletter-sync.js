'use strict';
const crypto=require('node:crypto');
const normalize=x=>typeof x==='string'?x.trim().toLowerCase():'';
const validEmail=x=>x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
function authorized(req,secret){
 const expected=Buffer.from('Bearer '+secret), supplied=Buffer.from(req.get('authorization')||'');
 return typeof secret==='string'&&secret.length>=32&&expected.length===supplied.length&&crypto.timingSafeEqual(expected,supplied);
}
async function optOut(db,address,when,source){
 const found=await db.ref('subscribers').orderByChild('email').equalTo(address).once('value');
 let changed=0;
 for(const key of Object.keys(found.val()||{})){
  const ref=db.ref('subscribers/'+key);
  // Prime the transaction cache: a cold SDK transaction may initially see null.
  const listener=()=>{};ref.on('value',listener);await ref.once('value');
  try{const result=await ref.transaction(old=>{
   if(!old||normalize(old.email)!==address)return;
   const consentAt=Number(old.consent?.recordedAt)||Number(old.subscribedAt)||Date.parse(old.subscribedAt)||0;
   if(consentAt>when||Number(old.unsubscribedAt)>=when)return;
   return {...old,active:false,subscribed:false,unsubscribed:true,status:'unsubscribed',unsubscribedAt:when,
    consent:{...(old.consent||{}),granted:false},unsubscribeSource:source};
  });if(result.committed)changed++;}finally{ref.off('value',listener);}
 }
 return changed;
}
async function contactBlocked(address,key,fetcher){
 if(!key)throw Error('configuration');
 const r=await fetcher('https://api.brevo.com/v3/contacts/'+encodeURIComponent(address),{headers:{'api-key':key,accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(r.status===404)return false;
 if(!r.ok)throw Error('provider');
 const contact=await r.json();
 if(typeof contact.emailBlacklisted!=='boolean')throw Error('provider-response');
 return contact.emailBlacklisted;
}
function handler(db,{secret=()=>process.env.BREVO_NEWSLETTER_WEBHOOK_SECRET,apiKey=()=>process.env.BREVO_API_KEY,fetcher=global.fetch,now=Date.now}={}){
 return async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).send('Method not allowed');
  if(!authorized(req,secret()))return res.status(401).send('Unauthorized');
  try{
   if(req.body?.action==='reconcile-transactional'){
    const offset=req.body.offset||0;
    if(!Number.isSafeInteger(offset)||offset<0)return res.status(400).send('Invalid offset');
    const r=await fetcher('https://api.brevo.com/v3/smtp/blockedContacts?limit=100&offset='+offset,{headers:{'api-key':apiKey(),accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('provider');
    const data=await r.json();if(!Array.isArray(data.contacts)||!Number.isFinite(data.count))throw Error('provider-response');
    let changed=0;
    for(const c of data.contacts){const address=normalize(c.email),when=Date.parse(c.blockedAt);if(validEmail(address)&&Number.isFinite(when)&&when<=now())changed+=await optOut(db,address,when,'brevo-transactional-reconciliation');}
    return res.json({checked:data.contacts.length,changed,nextOffset:offset+data.contacts.length<data.count&&data.contacts.length?offset+data.contacts.length:null});
   }
   if(req.body?.action==='reconcile'){
    const cursor=req.body.cursor||'';
    if(typeof cursor!=='string'||cursor.length>128||/[.#$\[\]/]/.test(cursor))return res.status(400).send('Invalid cursor');
    const query=db.ref('subscribers').orderByKey();
    const snap=await (cursor?query.startAfter(cursor):query).limitToFirst(11).once('value');
    const entries=Object.entries(snap.val()||{}).sort(([a],[b])=>a<b?-1:a>b?1:0),page=entries.slice(0,10);
    let changed=0;
    for(const [,record]of page){const address=normalize(record?.email);if(validEmail(address)&&await contactBlocked(address,apiKey(),fetcher))changed+=await optOut(db,address,now(),'brevo-reconciliation');}
    return res.json({checked:page.length,changed,nextCursor:entries.length>10?page.at(-1)[0]:null});
   }
   const events=Array.isArray(req.body)?req.body:[req.body];
   if(!events.length||events.length>100)return res.status(400).send('Invalid batch');
   // Validate the whole batch before writing. Never log emails or request bodies.
   const accepted=[];
   for(const event of events){
    if(!event||typeof event!=='object')return res.status(400).send('Invalid event');
    if(!['unsubscribe','unsubscribed','spam'].includes(event.event))continue;
    const address=normalize(event.email),seconds=Number(event.ts_event||event.ts);
    if(!validEmail(address)||!Number.isFinite(seconds)||seconds<=0||seconds*1000>now()+300000)return res.status(400).send('Invalid event');
    accepted.push({address,when:seconds*1000});
   }
   for(const event of accepted)await optOut(db,event.address,event.when,'brevo-marketing');
   return res.json({received:true});
  }catch(_){console.error('Newsletter synchronization failed; retry required');return res.status(503).send('Synchronization unavailable; retry later');}
 };
}
module.exports={handler,optOut,contactBlocked,authorized};
