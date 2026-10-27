'use strict';
const activeStatuses=new Set(['Paid','Processing','Preparing','Preparing Shipment','Shipped']);
function install(functions,s){
 const {call,db,uid,fail,ADMIN,mail}=s;
 const shipStoreOrder=call(async(d,c)=>{
  if(uid(c)!==ADMIN)fail('permission-denied','Administrator access required.');
  if(!/^[-A-Za-z0-9_]{20}$/.test(d.orderId||''))fail('invalid-argument','Invalid order reference.');
  const tracking=typeof d.tracking==='string'?d.tracking.trim():'';
  if(!tracking||tracking.length>150||/[<>\u0000-\u001f]/.test(tracking))fail('invalid-argument','Enter a valid tracking code.');
  const ref=db.ref('orders/'+d.orderId);
  const result=await ref.transaction(o=>{
   if(!o||!activeStatuses.has(o.status))return;
   if(o.status==='Shipped')return o.tracking===tracking?o:undefined;
   if(!o.shippingInfo?.email)return;
   return {...o,status:'Shipped',tracking,shippedAt:Date.now()};
  });
  if(!result.committed)fail('failed-precondition','Only paid orders awaiting shipment can be shipped. Check the order status and saved tracking.');
  return {success:true,status:'Shipped'};
 });
 const notifyOrderShipped=functions.database.ref('/orders/{orderId}').onUpdate(async(change,context)=>{
  const before=change.before.val(),after=change.after.val();
  if(!after||after.status!=='Shipped'||!after.tracking||before?.status==='Shipped')return null;
  const ref=db.ref('orders/'+context.params.orderId);
  const claim=await ref.transaction(o=>{
   if(!o||o.status!=='Shipped'||!o.tracking||o.shipmentEmail)return;
   return {...o,shipmentEmail:{state:'sending',startedAt:Date.now()}};
  });
  if(!claim.committed)return null;
  const order=claim.snapshot.val(),address=order.shippingInfo||{},tracking=String(order.tracking);
  try{
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email||''))throw Error('Missing recipient');
   const carrier=tracking.toUpperCase().startsWith('1Z')?'UPS':tracking.length===12||tracking.length===15?'FedEx':tracking.length===10?'DHL':'Carrier';
   await mail(address.email,7,{firstName:address.firstName||'there',orderId:context.params.orderId.slice(-6).toUpperCase(),trackingNumber:tracking,carrier,trackingUrl:'https://www.17track.net/en/track?nums='+encodeURIComponent(tracking),estimatedDelivery:['it','ita','italy','italia','italie','italien'].includes(String(address.country||'').trim().toLowerCase())?'3–7 working days within Italy':'5–14 working days internationally'});
   await ref.child('shipmentEmail').update({state:'sent',sentAt:Date.now()});
  }catch{
   // An email timeout may already have delivered: never blindly send a duplicate.
   await ref.child('shipmentEmail').update({state:'needs_review',updatedAt:Date.now()});
   console.error('Shipping notification requires delivery review.');
  }
  return null;
 });
 return {shipStoreOrder,notifyOrderShipped};
}
module.exports={install};
