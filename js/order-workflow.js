/* Order grouping is derived from paid order items; records are never moved or copied. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SayandOrderWorkflow=api;})(typeof window!=='undefined'?window:this,function(){
 const paid=o=>!!(o&&(o.paymentDate||o.stripeSessionId||['Paid','Processing','Preparing','Preparing Shipment'].includes(o.status)));
 const hasPreorder=o=>Object.values(o?.items||{}).some(i=>i?.isPreorder===true);
 const pending=o=>paid(o)&&hasPreorder(o)&&!o.shippedAt&&!/cancel|refund|return/i.test(o.status||'')&&!['Shipped','Delivered','Completed','Canceled','Cancelled','Canceled (By User)','Refunded','Return Requested','Return Approved','Return Declined'].includes(o.status);
 function itemStatus(order,item){if(!item?.isPreorder)return '';if(['Shipped','Delivered','Completed'].includes(order.status)||order.shippedAt)return order.status==='Delivered'?'PREORDER · DELIVERED':'PREORDER · SHIPPED';if(/cancel|refund|return/i.test(order.status||''))return 'PREORDER · '+String(order.status).toUpperCase();return paid(order)?'PREORDERED · PAID IN FULL':'PREORDER · AWAITING PAYMENT';}
 return {paid,hasPreorder,pending,itemStatus};
});
