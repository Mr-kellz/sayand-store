'use strict';
const normalize=value=>typeof value==='string'?value.trim().toLowerCase():'';
function activeSubscriber(record,address){
 if(!record||normalize(record.email)!==address)return false;
 if(record.unsubscribed===true||record.active===false||record.subscribed===false||record.unsubscribedAt||record.consent?.granted===false)return false;
 if(record.status&&!['active','subscribed','confirmed'].includes(String(record.status).toLowerCase()))return false;
 const date=typeof record.subscribedAt==='number'?record.subscribedAt:Date.parse(record.subscribedAt);
 return Number.isFinite(date)&&date>0;
}
async function eligible(db,auth,uid){
 if(!auth)return false;
 const user=await auth.getUser(uid),address=normalize(user.email);
 if(user.disabled||user.emailVerified!==true||!address)return false;
 const snap=await db.ref('subscribers').orderByChild('email').equalTo(address).once('value');
 const records=Object.values(snap.val()||{});
 // Any explicit opt-out for the same address takes precedence over old duplicates.
 if(records.some(r=>normalize(r?.email)===address&&(r.unsubscribed===true||r.active===false||r.subscribed===false||r.unsubscribedAt||r.consent?.granted===false||['unsubscribed','blocked','pending'].includes(String(r.status).toLowerCase()))))return false;
 return records.some(r=>activeSubscriber(r,address));
}
module.exports={eligible,activeSubscriber};
