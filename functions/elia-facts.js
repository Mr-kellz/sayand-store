'use strict';
const {products,number}=require('./catalogue');
const {buildQuote}=require('./checkout-security');
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9€]+/g,' ').trim();
const italian=(s,context={})=>/\b(ciao|sono|sei|avete|saldi|sconti|sconto|promozione|quanto|quali|taglie|colori|reso|rimborso|spedizione|matrimonio|regalo|disponibili|italiano)\b/i.test(s)||context.language==='it'&&!/\b(what|which|show|please|how|are you|do you|is there|can you|can i|my subtotal|recommend|any products)\b/i.test(s);
const format=(n,it=false)=>new Intl.NumberFormat(it?'it-IT':'en-IE',{style:'currency',currency:'EUR'}).format(n);
function available(data,now=Date.now()){
 const out=[];
 for(const p of products(data)){
  if(p.isVipOnly||p.isHidden||p.isDraft||p.isPreorder||p.isOutOfStock)continue;
  if(number(p.price)===null)continue;
  const quantity=number(p.quantity);if(!Number.isInteger(quantity)||quantity<1)continue;
  let sizes=Array.isArray(p.sizes)?p.sizes:typeof p.sizes==='string'?p.sizes.split(',').map(s=>s.trim()):['OS'];
  if(p.sizeQuantities){if(Object.values(p.sizeQuantities).some(q=>!Number.isInteger(number(q))))continue;sizes=Object.keys(p.sizeQuantities).filter(s=>number(p.sizeQuantities[s])>0);}
  if(!sizes.length)continue;
  const colors=Array.isArray(p.colors)?p.colors:typeof p.colors==='string'?p.colors.split(',').map(s=>s.trim()):[];
  let price;try{price=buildQuote({mainStore:data},{userId:'public',status:'Pending',items:[{name:p.name,size:sizes[0],color:colors[0]||'Default',quantity:1}],shippingInfo:{firstName:'Example',email:'example@example.test',address:'Example',city:'Example',zip:'00000',country:'Italy'}},'example','public',now).subtotal;}catch{continue;}
  let image=null;try{const u=new URL(p.images?.[0]||p.img);if(u.protocol==='https:'&&!u.username&&!u.password)image=u.href;}catch{}
  const original=number(p.price),onSale=original!==null&&price<original&&price>0;
  out.push({name:p.name,price,originalPrice:onSale?original:null,isOnSale:onSale,saleEndDate:onSale?p.saleEndDate||null:null,currency:'EUR',inStock:true,sizes,colors,productUrl:'https://thesayand.com'+p.route,image,category:p.category||'',description:String(p.description||'').replace(/<[^>]*>/g,' ').slice(0,500)});
 }
 return out;
}
function intent(message,context={}){
 const q=normalize(message),it=italian(message,context);
 const budget=message.match(/(?:under|below|less than|up to|budget(?: of)?|sotto|meno di|fino a)\s*(?:€|eur\s*)?(\d+(?:[.,]\d{1,2})?)/i);
 const saleProducts=/\b(discounted|reduced|markdowns?|scontati|scontate|ribassati)\b/.test(q)||/\b(products?|items?|hats?|gowns?|articoli|prodotti|cappelli)\b.*\b(on sale|in saldo)\b/.test(q);
 const generalSale=/^(?:any|are there any|do you have any|avete|ci sono)?\s*(?:sales|saldi)[ ?!.]*$/i.test(message.trim());
 const kind=saleProducts?'product-sale':generalSale?'sales':/\b(wedding|occasion|outfit|matrimonio|occasione)\b/.test(q)?'occasion':budget?'budget':/\b(in stock|currently in stock|disponibili|disponibilita)\b/.test(q)?'stock':/\b(hats?|caps?|gowns?|bubu|dress|dresses|shirts?|products?|items?|collection|african|cappelli|abiti|prodotti)\b/.test(q)?'discovery':/\b(sizes?|colours?|colors?|price|taglie|colori|prezzo)\b/.test(q)?'details':null;
 return {kind,it,budget:budget?Number(budget[1].replace(',','.')):null,strict:!!budget&&/^(under|below|less than|sotto|meno di)/i.test(budget[0])};
}
function catalogueAnswer(data,message,context={}){
 const parsed=intent(message,context),{kind,it,budget,strict}=parsed,q=normalize(message),all=available(data);
 const named=products(data).filter(p=>(' '+q+' ').includes(' '+normalize(p.name)+' ')).sort((a,b)=>b.name.length-a.name.length)[0];
 let chosen=named?all.filter(p=>p.name===named.name):all;
 let subject=named?.name;
 if(!named&&kind==='details'&&context.productName){chosen=all.filter(p=>p.name===context.productName);subject=context.productName;}
 if(kind==='occasion'&&!named)return {catalogueVerified:true,products:[],answer:it?'Volentieri! È per te o per un regalo? Per il matrimonio preferisci un abito elegante o uno stile più semplice, e qual è il tuo budget?':'I’d love to help. Is the outfit for you, and what’s your budget? Do you prefer a dress or a more understated look for the wedding?',context:{language:it?'it':'en'}};
 if(!kind&&!named)return null;
 if(!named&&!subject){
  const category=/\b(hats?|caps?|cappelli)\b/.test(q)?/\b(hat|cap|cappell)/i:/\b(gowns?|bubu|dresses|dress|abiti|african)\b/.test(q)?/gown|bubu|dress|african|abito/i:/\b(shirts?|camicie)\b/.test(q)?/shirt|camici/i:null;
  if(category)chosen=chosen.filter(p=>category.test(p.name+' '+p.category+' '+p.description));
 }
 if(kind==='product-sale'||kind==='sales')chosen=chosen.filter(p=>p.isOnSale);
 if(budget!==null)chosen=chosen.filter(p=>strict?p.price<budget:p.price<=budget).sort((a,b)=>a.price-b.price);
 const cards=chosen.slice(0,3);let answer;
 if(subject){const p=cards[0];answer=p?(it?`${p.name}: ${format(p.price,true)}. Taglie disponibili: ${p.sizes.join(', ')}. Colori: ${p.colors.join(', ')||'non specificati'}.`:`${p.name} is ${format(p.price)}. Available sizes: ${p.sizes.join(', ')}. Colours: ${p.colors.join(', ')||'not specified'}.`):(it?`Non posso confermare disponibilità e varianti di ${subject} al momento.`:`I can’t confirm available stock and variants for ${subject} right now.`);}
 else answer=cards.length?(it?'Ecco alcune opzioni disponibili. I prezzi e gli eventuali ribassi sono indicati qui sotto.':kind==='budget'?'Here are available options within your budget—these could make a lovely gift.':kind==='product-sale'||kind==='sales'?'These available products are currently reduced. The cards show both prices.':'I found these available options for you. Any current reductions are shown below.'):(it?'Non ho trovato opzioni disponibili verificate per questa richiesta. Vuoi provare un altro stile o budget?':'I couldn’t verify available options for that request. Would you like to try another style or budget?');
 return {catalogueVerified:true,products:cards,answer,context:{language:it?'it':'en',...(subject?{productName:subject}:cards.length===1?{productName:cards[0].name}:{})}};
}
module.exports={available,intent,catalogueAnswer,italian,format,normalize};
