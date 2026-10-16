'use strict';
// Read-only assistance: checkout remains the sole authority for payable amounts.
const {buildQuote}=require('./checkout-security');
const {products}=require('./catalogue');
const money=v=>{if(!['number','string'].includes(typeof v)||v==='')return null;const n=Number(v),c=Math.round(n*100);return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(c)?c:null;};
const euro=c=>'€'+(c/100).toFixed(2);
function promotionIntent(q){return /\b(promos?|promotions?|sales?|offers?|coupons?|discounts?|countdown|minimum[ -]spend|minimum (?:qualifying )?order|threshold)\b/i.test(q);}
function basketIntent(q){return promotionIntent(q)&&/\b(reach|meet|help|suggest|recommend|find|basket|combination)\b/i.test(q)&&/\b(threshold|minimum|spend|basket|products?|items?|combination)\b/i.test(q);}
// Only whole, general questions qualify; mixed/private requests still hit the original guard.
function generalPromotionPolicy(q){return /^(?:please )?(?:show me|tell me|explain|what (?:is|are)) (?:the |your |sayand's )?(?:minimum (?:qualifying )?order (?:amount|value)|discount eligibility|checkout discount rules|promotion rules)[?.]?$/i.test(q.trim());}
function activePromotion(a,now=Date.now()){
 if(!a?.active||!a.isPromo)return null;
 const ends=Date.parse(a.promoEndDate),minimum=money(a.promoMinAmount||0),percent=Number(a.promoPercent);
 if(!Number.isFinite(ends)||ends<=now||minimum===null||!Number.isFinite(percent)||percent<=0||percent>100)return null;
 return {percent,minimum,ends};
}
const shippingInfo={firstName:'Example',email:'example@example.test',address:'Example',city:'Example',zip:'00000',country:'Italy'};
function quote(store,items,now){return buildQuote({mainStore:store},{userId:'public-example',status:'Pending',items,shippingInfo},'public-example','public-example',now);}
function basket(store,target,now){
 const candidates=[];
 for(const p of products(store)){
  const sizes=Object.keys(p.sizeQuantities||{}),size=sizes.length?sizes.filter(s=>Number.isInteger(Number(p.sizeQuantities[s]))&&Number(p.sizeQuantities[s])>0).sort((a,b)=>Number(p.sizeQuantities[b])-Number(p.sizeQuantities[a]))[0]:(Array.isArray(p.sizes)?p.sizes[0]:'OS');
  const qty=Number(p.quantity),limit=Math.min(10,qty,sizes.length?Number(p.sizeQuantities[size]):qty);
  if(!size||!Number.isInteger(qty)||qty<1||!Number.isInteger(limit)||limit<1)continue;
  let image;try{const u=new URL(p.images?.[0]||p.img);if(u.protocol!=='https:'||u.username||u.password)continue;image=u.href;}catch{continue;}
  const item={name:p.name,size,color:Array.isArray(p.colors)?p.colors[0]||'Default':'Default',quantity:1};
  try{const q=quote(store,[item],now);candidates.push({item,limit,cents:Math.round(q.subtotal*100),card:{name:p.name,price:q.subtotal,originalPrice:Number(p.price)>q.subtotal?Number(p.price):null,isOnSale:Number(p.price)>q.subtotal,saleEndDate:p.saleEndDate||null,currency:'EUR',sizes:[size],colors:[item.color],productUrl:'https://thesayand.com'+p.route,image,inStock:true}});}catch{}
 }
 // Prefer a varied, single-quantity basket within 10% of the target (at least €10).
 // Only use duplicate quantities when distinct styles cannot sensibly reach the target.
 const pool=candidates.slice(0,50),ceiling=target+Math.max(1000,Math.round(target*.1));
 const repeats=s=>s.lines.reduce((n,p)=>n+p.qty-1,0);
 const better=(a,b)=>{
  if(!b)return true;
  const nearA=a.total<=ceiling,nearB=b.total<=ceiling;
  if(nearA!==nearB)return nearA;
  if(nearA&&repeats(a)!==repeats(b))return repeats(a)<repeats(b);
  if(a.total!==b.total)return a.total<b.total;
  return repeats(a)<repeats(b)||repeats(a)===repeats(b)&&a.lines.length>b.lines.length;
 };
 let states=[{total:0,lines:[]}],best=null;
 for(const p of pool){
  const next=[...states];
  for(const s of states)if(s.lines.length<3)for(let qty=1;qty<=p.limit;qty++){
   const n={total:s.total+p.cents*qty,lines:[...s.lines,{...p,qty}]};
   if(n.total>=target){if(better(n,best))best=n;}
   else next.push(n);
  }
  const unique=new Map();for(const s of next){const k=s.total+':'+s.lines.length;const old=unique.get(k);if(!old||repeats(s)<repeats(old))unique.set(k,s);}
  states=[...unique.values()].sort((a,b)=>repeats(a)-repeats(b)||b.total-a.total).slice(0,500);
 }
 // Exhaust all single-quantity combinations (up to three cards) so pruning cannot
 // discard a sensible varied basket in favour of identical products.
 function distinct(start,lines,total){
  if(lines.length){const n={lines,total};if(total>=target&&better(n,best))best=n;}
  if(lines.length===3)return;
  for(let i=start;i<pool.length;i++)distinct(i+1,[...lines,{...pool[i],qty:1}],total+pool[i].cents);
 }
 distinct(0,[],0);
 const chosen=best||states.sort((a,b)=>b.total-a.total)[0];
 if(!chosen?.lines.length)return null;
 const verified=quote(store,chosen.lines.map(p=>({...p.item,quantity:p.qty})),now);
 return {total:Math.round(verified.subtotal*100),cards:chosen.lines.map(p=>p.card),lines:chosen.lines.map(p=>`${p.qty} × ${p.item.name} (${p.item.size}, ${p.item.color}) = ${euro(p.cents*p.qty)}`)};
}
async function promotionReply(db,message,now=Date.now()){
 if(!promotionIntent(message))return null;
 const result={catalogueVerified:true,products:[]};
 try{
  const a=(await db.ref('mainStore/announcement').once('value')).val();const promo=activePromotion(a,now);
  let answer=promo?`Yes—our current automatic offer is ${promo.percent}% off the item subtotal when it reaches ${euro(promo.minimum)}. No promotional code is needed. Ends ${new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',dateStyle:'long',timeStyle:'short'}).format(new Date(promo.ends))}, Italy local time. Checkout confirms eligibility and the final discount.`:'I can’t confirm an active store-wide promotion right now. I won’t quote an unverified offer. Checkout can validate any code you already have.';
  if(basketIntent(message)){
   const m=message.match(/(?:€\s*|\bEUR\s*)(\d+(?:[.,]\d{1,2})?)/i)||message.match(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|threshold)/i);
   const target=m?money(m[1].replace(',','.')):promo?.minimum;
   if(!target||target>1000000)return {...result,answer:answer+' What item-subtotal target would you like help reaching?'};
   const store={};for(const section of ['newArrivals','trending','sales','upcomingSales'])store[section]=(await db.ref('mainStore/'+section).once('value')).val();
   const b=basket(store,target,now);
   answer=`I can help! I can’t see your current bag here, so this is a separate example basket for ${euro(target)}.`;
   if(b){answer+='\n'+b.lines.join('\n')+`\nItem subtotal: ${euro(b.total)} before shipping and discounts.`+(b.total<target?' These verified options do not reach that target.':'');result.products=b.cards;}
   else answer+=' I couldn’t verify available products with valid prices and photos just now.';
   answer+=promo?` The current offer requires ${euro(promo.minimum)}; checkout confirms stock, eligibility and any discount.`:' This target does not establish an active promotion; checkout confirms any discount.';
  }
  return {...result,answer};
 }catch{return {...result,answer:'I’m sorry, I can’t verify the live offer just now. Please check again shortly; I don’t want to promise an incorrect discount.'};}
}
module.exports={promotionIntent,basketIntent,generalPromotionPolicy,activePromotion,basket,promotionReply};
