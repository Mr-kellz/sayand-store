'use strict';
// Only bounded public shopping context. Never customer identifiers or order data.
const clean=s=>String(s||'').toLowerCase().replace(/[?!.,]/g,'').replace(/\s+/g,' ').trim();
function fresh(c){return c&&Number.isFinite(c.at)&&Date.now()-c.at<30*60*1000&&c.at<=Date.now()?c:{};}
function resolve(message,previous){
 const c=fresh(previous),q=clean(message),it=c.language==='it'||/\b(con|bastano|qualifica|quanto|euro|scade)\b/.test(q)&&/\b(con|bastano|qualifica|quanto|scade)\b/.test(q);
 const amount=message.trim().match(/^(?:(?:does|will|would|is|and|what about|how about|e|con|bastano)\s+)?(?:€\s*|eur\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|eur|€)?\s*(?:(?:qualify|qualifies|count|work|be enough|enough|qualifica|bastano)(?:\s+(?:for (?:it|that|the promotion)))?)?[?!.]*$/i);
 // Resolve monetary follow-ups by meaning within the active public topic, not one exact sentence.
 const amounts=[...String(message).matchAll(/(?:€\s*|\beur\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:euros?\b|eur\b|€)?/gi)];
 const moneyFollow=/\b(qualif\w*|pass|enough|work|checkout|spend|subtotal|subtotale|bast\w*|sufficient\w*|rientr\w*)\b/.test(q);
 const differentTopic=/\b(hat|hats|gown|gowns|dress|dresses|product|products|size|sizes|colour|color|shipping|delivery|return|refund|order number|tracking|days|minutes|hours)\b/.test(q);
 if(c.topic==='promotion'&&amounts.length===1&&(moneyFollow||/€|\b(?:euros?|eur)\b/i.test(message))&&!differentTopic){
  const subtotal=Number(amounts[0][1].replace(',','.'));
  if(Number.isFinite(subtotal)&&subtotal>=0)return {question:`${it?'promozione subtotale':'promotion subtotal'} ${subtotal}`,subtotal};
 }
 if(c.topic==='promotion'&&/\b(?:talking about|mean|meant|referring to)\b/.test(q)&&/\b(?:promo|promotion|offer|discount)\b/.test(q)&&Number.isFinite(c.subtotal))return {question:`${it?'promozione subtotale':'promotion subtotal'} ${c.subtotal}`,subtotal:c.subtotal};
 if(amount&&c.topic==='promotion')return {question:`${it?'promozione subtotale':'promotion subtotal'} ${amount[1]}`,subtotal:Number(amount[1].replace(',','.'))};
 if(c.topic==='promotion'){
  if(/^(?:is that enough|would that qualify|will that work|does that count|is that sufficient|would it qualify|basta cosi)$/.test(q)&&Number.isFinite(c.subtotal))return {question:`${it?'promozione subtotale':'promotion subtotal'} ${c.subtotal}`,subtotal:c.subtotal};
  if(/^(?:when does it (?:end|expire)|when does that end|until when|quando scade|e la scadenza)$/.test(q))return {question:it?'quando scade la promozione':'when does the promotion expire'};
  if(/^(?:is it automatic|do i need a code|does it apply automatically|serve un codice|e automatico)$/.test(q))return {question:it?'promozione codice automatico':'promotion automatic code'};
  if(/^(?:does (?:that|it) include shipping|before or after shipping|shipping included|spedizione inclusa)$/.test(q))return {question:it?'promozione spedizione inclusa':'promotion shipping included'};
  if(/^(?:how much more|how much am i short|quanto manca)$/.test(q)&&Number.isFinite(c.subtotal))return {question:`${it?'promozione subtotale':'promotion subtotal'} ${c.subtotal}`,subtotal:c.subtotal};
 }
 if(c.topic==='returns'){
  if(/^(?:how many days|from purchase or delivery|when does the period start|quanti giorni|dall acquisto o dalla consegna)$/.test(q))return {question:it?'reso giorni consegna':'return policy days delivery'};
  if(/^(?:can i upload (?:a photo|an image|a video|a pdf)|what files can i send|what about (?:photos|pdf|heic)|posso caricare una foto)$/.test(q))return {question:it?'reso allegati formati':'return evidence file formats'};
  if(/^(?:is the refund automatic|does approval refund me|e automatico il rimborso)$/.test(q))return {question:it?'approvazione reso rimborso':'Does approving my return automatically refund my money?'};
 }
 const follow=/^(?:how much (?:is it|does it cost)|what (?:sizes|colours|colors) (?:are available|does it come in)|is it (?:available|in stock)|what about (?:sizes|colours|colors)|and (?:sizes|colours|colors)|quanto costa|quali taglie|quali colori|e disponibile)$/.test(q);
 const ordinal=q.match(/^(?:(?:show me|what about|how much is|sizes for|colours for|colors for|what colours does|what colors does|what sizes does) )?(?:the )?(first|second|third|1st|2nd|3rd)(?: one)?(?: come in)?$/);
 if(c.topic==='products'&&(follow||ordinal)){
  const names=Array.isArray(c.names)?c.names.slice(0,3):[],idx=ordinal?({first:0,second:1,third:2,'1st':0,'2nd':1,'3rd':2})[ordinal[1]]:null;
  const name=idx!==null?names[idx]:c.productName|| (names.length===1?names[0]:null);
  if(name)return {question:`${it?'taglie colori prezzo':'sizes colours price'} ${name}`};
  return {clarify:it?'Quale prodotto intendi? Dimmi il nome o scegli il primo, secondo o terzo.':'Which product do you mean? Tell me its name, or choose the first, second or third.',keep:true};
 }
 if(c.topic==='products'&&/^(?:anything cheaper|something cheaper|cheaper options|qualcosa di piu economico)$/.test(q)&&Number.isFinite(c.price))return {question:`${c.category||'products'} under €${c.price}`};
 const budget=message.match(/^(?:my budget is |up to |under |sotto |fino a )?€?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|€)?[?!.]*$/i);
 if(c.topic==='occasion'&&budget)return {question:`dresses under €${budget[1]}`};
 if(follow||amount)return {clarify:it?'A quale prodotto o promozione ti riferisci?':'Which product or promotion do you mean?',keep:false};
 return {question:message};
}
function remember(message,result,previous,resolved){
 const old=fresh(previous),q=clean(resolved.question||message),next={language:result?.context?.language||old.language||'en',at:Date.now()};
 if(resolved.clarify&&resolved.keep)return {...old,at:Date.now()};
 if(/\b(promotion|promotions|promo|discount|discounts|offer|offers|minimum|threshold|promozione|sconto|sconti|sales|saldi)\b/.test(q)&&!result?.products?.length||/\b(promotion|promozione|automatic|announcement)\b/.test(q)){
  next.topic='promotion';const m=q.match(/(?:subtotal|subtotale)\s+(\d+(?:[.,]\d+)?)/);if(resolved.subtotal!==undefined)next.subtotal=resolved.subtotal;else if(m)next.subtotal=Number(m[1]);else if(old.topic==='promotion'&&Number.isFinite(old.subtotal))next.subtotal=old.subtotal;
 }else if(result?.products?.length){
  next.topic='products';next.names=result.products.slice(0,3).map(p=>p.name).filter(n=>typeof n==='string').map(n=>n.slice(0,200));
  if(result.context?.productName)next.productName=result.context.productName.slice(0,200);
  if(result.products.length===1)next.price=result.products[0].price;
  next.category=/\b(hat|hats|cap|caps)\b/.test(q)?'hats':/\b(gown|gowns|dress|dresses|bubu)\b/.test(q)?'dresses':'products';
 }else if(/\b(return|returns|refund|reso|rimborso|allegati)\b/.test(q))next.topic='returns';
 else if(/\b(wedding|occasion|matrimonio|outfit)\b/.test(q))next.topic='occasion';
 else if(/^(?:thanks|thank you|ok|okay|grazie)$/.test(q))return {...old,at:Date.now()};
 return next;
}
module.exports={resolve,remember,fresh};
