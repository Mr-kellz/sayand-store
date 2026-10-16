'use strict';
const {readCatalogue,products,key,number}=require('./catalogue');
const {query,normalize}=require('./shop-query');
const {promotionIntent}=require('./elia-promotions');

// Public product facts and cards are generated together, never inferred from prose.
function shoppingQuestion(message) {
 if(promotionIntent(message))return false;
 const q=normalize(message);
 if(/\b(order|orders|return|returns|refund|shipping|delivery|payment|policy|policies|cancel)\b/.test(q))return false;
 return /\b(hat|hats|cap|caps|gown|gowns|bubu|african|dress|dresses|shirt|shirts|trouser|trousers|accessories|collection|product|products|sale|sales|stock|available|availability|price|prices|cheapest|expensive|buy|shop|shopping|recommend|wear|size|sizes|colour|color)\b/.test(q)||/\b(do you have|show me|looking for)\b/.test(q);
}
function reply(data,message) {
 const question=message.replace(/\bhasve\b/ig,'have').replace(/\b(?:how about|do you have|can you show me|please|currently)\b/ig,' ').replace(/\bproducts? (?:is|are) on sale\b/ig,'on sale').trim();
 const found=query(data,{question,limit:50});
 const raw=new Map(products(data).map(p=>[key(p.name),p]));
 const eligible=found.products.filter(p=>{
  const original=raw.get(key(p.name));
  if(!original||!p.inStock||p.price===null||p.catalogueConflict)return false;
  // When per-size stock exists, contradictory/unknown size totals are not recommended.
  if(original.sizeQuantities&&typeof original.sizeQuantities==='object') {
   const counts=Object.values(original.sizeQuantities);
   if(!counts.length||counts.some(v=>number(v)===null)||!counts.some(v=>number(v)>0))return false;
  }
  return true;
 });
 const cards=eligible.slice(0,3).map(p=>{
  const original=raw.get(key(p.name));let image=null;
  try{const u=new URL(original.images?.[0]||original.img);if(u.protocol==='https:'&&!u.username&&!u.password)image=u.href;}catch{}
  return {name:p.name,price:p.price,originalPrice:p.isOnSale?p.originalPrice:null,isOnSale:p.isOnSale,saleEndDate:p.saleEndDate,currency:'EUR',sizes:p.sizes,colors:p.colors,productUrl:p.productUrl,image,inStock:true};
 });
 return {catalogueVerified:true,products:cards,answer:cards.length
  ?`I’d be happy to help! ${cards.length===1?'This option is currently available':'I found '+cards.length+' available options for you'}. You can see the prices and details below. Would you like help choosing a size or colour?`
  :found.products.length?'I found matching styles, but I can’t confirm one with stock and a price right now. I don’t want to recommend something you can’t order. Would you like to try another style?':'I’m happy to help you look. I couldn’t confirm a match for that search—could you share the product name or the style you have in mind?'};
}
async function catalogueReply(db,message) {
 if(!shoppingQuestion(message))return null;
 try{return reply(await readCatalogue(db),message);}
 catch{return {catalogueVerified:true,products:[],answer:'I’m sorry, I can’t check the current collection just now. Please try again shortly so I can help you with accurate availability.'};}
}
module.exports={shoppingQuestion,reply,catalogueReply};
