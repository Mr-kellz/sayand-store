'use strict';
const {readCatalogue,products,number,visible,key}=require('./catalogue');
const text=v=>typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,2000):'';
const normalize=v=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const singular=v=>({hats:'hat',caps:'cap',gowns:'gown',dresses:'dress',shirts:'shirt',trousers:'trouser',accessories:'accessory',colours:'colour',colors:'color',products:'product',items:'item',sizes:'size',prices:'price'})[v] || v;
const tokens=v=>normalize(v).split(' ').map(singular);
const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string').map(text).slice(0,40):typeof v==='string'?v.split(',').map(text):[];
function safeProduct(p,duplicate=false,now=Date.now()) {
 const sizes=list(p.sizes), colors=list(p.colors), quantity=number(p.quantity), price=number(p.price), sale=number(p.salePrice);
 const isOnSale=price!==null && sale!==null && sale>0 && sale<price && (!p.saleEndDate || Date.parse(p.saleEndDate)>now);
 const sizeQuantities=Object.fromEntries(sizes.filter(size=>number(p.sizeQuantities?.[size])!==null).map(size=>[size,number(p.sizeQuantities[size])]));
 const measurements={};
 for(const size of sizes)if(p.measurements?.[size]) {
  const allowed=Object.entries(p.measurements[size]).filter(([k,v])=>/^(chest|bust|waist|hip|hips|length|sleeve|shoulder|inseam|height|width)$/i.test(k) && ['string','number'].includes(typeof v)).map(([k,v])=>[k,text(String(v)).slice(0,40)]);
  if(allowed.length)measurements[size]=Object.fromEntries(allowed);
 }
 return {name:text(p.name),category:text(p.category),description:text(p.description),price:duplicate?null:(isOnSale?sale:price),currency:'EUR',originalPrice:duplicate?null:price,salePrice:isOnSale && !duplicate?sale:null,salePercent:isOnSale && !duplicate?Math.round((price-sale)/price*100):null,saleEndDate:isOnSale?text(p.saleEndDate)||null:null,isOnSale:isOnSale&&!duplicate,quantity:duplicate?null:quantity,inStock:!duplicate&&!p.isOutOfStock&&!p.isPreorder&&quantity!==null&&quantity>0,isOutOfStock:!!p.isOutOfStock || quantity===0,sizes,colors,sizeQuantities,measurements:Object.keys(measurements).length?measurements:null,productUrl:'https://thesayand.com'+p.route,...(duplicate?{catalogueConflict:true}:{}),colorStockKnown:false};
}
function query(data,input={},now=Date.now()) {
 const raw=text(input.question || input.query), q=normalize(raw), op=normalize(input.operation), counts=new Map();
 for(const section of ['newArrivals','trending','sales'])for(const p of Object.values(data[section] || {}))if(visible(p))counts.set(key(p.name),(counts.get(key(p.name)) || 0)+1);
 const all=products(data).map(p=>safeProduct(p,counts.get(key(p.name))>1,now));
 const prices=all.map(p=>p.price).filter(p=>p!==null);
 const catalogue={totalProducts:all.length,inStockProducts:all.filter(p=>p.inStock).length,productsOnSale:all.filter(p=>p.isOnSale).length,categories:[...new Set(all.map(p=>p.category).filter(Boolean))],lowestCurrentPrice:prices.length?Math.min(...prices):null,highestCurrentPrice:prices.length?Math.max(...prices):null,currency:'EUR'};
 let category=normalize(input.category);
 if(!category){if(/\b(women|woman)\b/.test(q))category='women';else if(/\b(men|man)\b/.test(q))category='men';else if(/\baccessor(y|ies)\b/.test(q))category='accessories';}
 const size=normalize(input.size),color=normalize(input.color || input.colour);
 const cheapest=op==='cheapest'||/\b(cheapest|lowest price|least expensive)\b/.test(q),expensive=op==='most expensive'||/\b(most expensive|highest price)\b/.test(q);
 const sale=op==='sale'||input.sale_only===true||input.sale_only==='true'||/\b(on sale|discounted)\b/.test(q);
 const outOfStock=op==='out of stock'||/\bout of stock\b/.test(q);
 const stock=op==='stock'||/\b(in stock|available|availability)\b/.test(q);
 const budget=(direction)=>{const regex=direction==='max'?/(?:under|below|less than|up to|maximum|max|budget(?: of)?)\s*(?:€|eur\s*)?(\d+(?:[.,]\d+)?)/i:/(?:over|above|more than|minimum|min)\s*(?:€|eur\s*)?(\d+(?:[.,]\d+)?)/i;const found=raw.match(regex);return found?number(found[1].replace(',','.')):null;};
 const max=number(input.max_price)??budget('max'), min=number(input.min_price)??budget('min');
 const fillers=new Set('a an all some out many and any are at available availability can catalogue catalog cheapest colour color current currently do does expensive find for have highest in is item least lowest me moment most now of on price product sale sales sayand show size stock the to what which with you under below less than up maximum max budget over above more minimum min euro eur euros please i want looking need from shipping delivery return refund exchange guide how choose measurement'.split(' '));
 const queryTokens=tokens(raw).filter(t=>t.length>1&&!fillers.has(t)&&!/^\d+$/.test(t)&&!tokens(category).includes(t)&&!tokens(size).includes(t)&&!tokens(color).includes(t));
 const policy=/\b(shipping|delivery|returns?|refund|exchange|sizing|size guide)\b/.test(q);
 let results=all.filter(p=>{
  if(category && singular(normalize(p.category))!==singular(category))return false;
  if(size && !p.sizes.some(s=>normalize(s)===size))return false;
  if(color && !p.colors.some(c=>normalize(c)===color))return false;
  if(sale&&!p.isOnSale || stock&&!p.inStock || outOfStock&&!p.isOutOfStock)return false;
  if(stock&&size&&!Object.entries(p.sizeQuantities).some(([s,n])=>normalize(s)===size&&n>0))return false;
  if(max!==null&&(p.price===null||p.price>max) || min!==null&&(p.price===null||p.price<min))return false;
  const words=tokens([p.name,p.category,p.description,...p.sizes,...p.colors].join(' '));
  return policy || queryTokens.every(t=>words.includes(t));
 });
 if(cheapest||expensive)results=results.filter(p=>p.price!==null).sort((a,b)=>cheapest?a.price-b.price:b.price-a.price);
 const publicInfo={};for(const [k,re] of [['shipping',/shipping|delivery/],['returns',/return|refund|exchange/],['size',/sizing|size guide|measurement/]])if(re.test(q)){const p=data.footer?.[k];publicInfo[k]=p?{title:text(p.title),content:text(p.content)}:null;}
 const limit=Math.max(1,Math.min(50,Number.parseInt(input.limit,10)||25));
 return {success:true,question:raw || null,operation:cheapest?'cheapest':expensive?'most_expensive':sale?'sale':stock?'stock':policy?'public_info':'search',catalogue,publicInfo,count:Math.min(results.length,limit),products:results.slice(0,limit)};
}
function handler(db,authorized,legacy=false) {return async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
 if(!authorized(req))return res.status(401).json({success:false,error:'Unauthorized'});
 try {
  if(JSON.stringify(req.body || {}).length>12000)return res.status(400).json({success:false,error:'Query too long'});
  const data=await readCatalogue(db);data.footer=Object.fromEntries(await Promise.all(['shipping','returns','size'].map(async k=>[k,(await db.ref('mainStore/footer/'+k).once('value')).val()])));
  const input={...req.query,...req.body}, result=query(data,input);
  if(legacy)result.query={text:text(input.query)||null,category:text(input.category)||null,size:text(input.size)||null,color:text(input.color || input.colour)||null,saleOnly:input.sale_only===true||input.sale_only==='true'};
  return res.json(result);
 }catch(e){console.error('Public shop query failed',e.code || 'internal');return res.status(503).json({success:false,error:'Shop information is temporarily unavailable.'});}
};}
module.exports={query,handler,safeProduct,normalize};
