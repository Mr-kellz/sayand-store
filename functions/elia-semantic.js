'use strict';
// Semantic interpretation belongs to the model. This module validates data/tools,
// never classifies customer sentences or retrieves private customer records.
const {readCatalogue,products,key}=require('./catalogue');
const {safeProduct}=require('./shop-query');
const {activePromotion,basket}=require('./elia-promotions');
const {buildQuote}=require('./checkout-security');
const CONTRACT='sayand-semantic-v1';
const MAX_HISTORY=24,MAX_CONTEXT=110000;
const clean=(v,n=1000)=>String(v??'').replace(/<[^>]*>/g,' ').slice(0,n);
const money=n=>{if(!/^(?:0|[1-9]\d{0,6})(?:[.,]\d{1,2})?$/.test(String(n)))throw Error('Invalid money argument');return Math.round(Number(String(n).replace(',','.'))*100);};
const euro=c=>(c/100).toFixed(2);
const shippingInfo={firstName:'Example',email:'example@example.test',address:'Example',city:'Example',zip:'00000',country:'Italy'};
const POLICIES={
 language:'Reply in the language of the current customer message. Hello and Hi are English greetings: answer them in English, even if earlier replies were Italian. Use English when the message is ambiguous unless the customer explicitly requested a different language. Never choose Italian merely because SAYAND is based in Italy or prices are in euros.',
 productCards:'When describing or recommending an available product, include its exact catalogue id in productIds so the customer receives its verified picture, details and clickable product link. This includes orderable preorders even though inStock is false. Do not leave productIds empty when naming an available preorder. Do not invent URLs or images in prose.',
 identity:'Elia is SAYAND’s AI personal shopping assistant, not a human.',
 preorders:{payment:'Pay the preorder price in full at checkout now, not a deposit, reservation of interest or payment on dispatch.',pricing:'price is the preorder price; launchPrice is the intended later launch price; savings is launchPrice minus preorder price. Do not call a preorder a regular sale.',availability:'isPreorder products are future releases. inStock=false does not mean sold out when isOrderable=true. quantity is remaining preorder capacity shared across sizes unless sizeQuantities are specified. Never describe preorders as ready to ship or include them in requests for in-stock/ready-to-ship products without clearly distinguishing them.',timing:'expectedShipDate is an estimated dispatch date for that product, not a guaranteed delivery date or a number of days from each new order. Do not substitute the standard in-stock delivery window. No date is promised beyond the live product data.',howTo:'Open the preorder product card, choose size and quantity, add to bag and complete the normal checkout. ELIA cannot place orders or take payment in chat. After payment, My Account → Orders labels preorder items PREORDERED. When SAYAND marks the order shipped, the dashboard updates to SHIPPED and a shipping email with tracking is triggered. Mixed orders stay together until the whole order is shipped. ELIA cannot inspect or change a customer’s order.',discovery:'Use the live catalogue to answer preorder and upcoming-drop questions and name matching preorder products. Show selected product cards with their preorder facts. The storefront has a separate PREORDER DROPS section in each relevant collection. Generic basket suggestions from the basket tool cover in-stock products only.',changes:'Checkout rechecks price, remaining quantity and dispatch date. Never invent capacity, dates, extensions or a guaranteed refund/cancellation exception; use published policy and support for order-specific requests.'},
 privacy:'No access to carts, customer orders, account details or private rewards. No account/payment actions. Direct customers to My Account → Orders for their private order and any provided tracking.',
 returns:{windowDays:30,startsAt:'recorded delivery timestamp, not purchase',requestAfter:'Delivered',condition:'Original condition and tags where required',approvalAutomaticallyRefunds:false,refundProcessing:'SAYAND handles eligible refunds separately after checks. Do not promise a refund date or an automatically generated shipping label.',evidence:{formats:['JPEG','PNG','WebP','MP4','WebM'],maxBytes:4*1024*1024,maxFiles:6,unsupported:['HEIC','PDF'],steps:['Open the eligible order’s return conversation','Choose file','Select a supported file','Upload file','Check the saved-evidence confirmation; View opens a preview and Download saves a copy'],limits:'Do not bypass closed-case or rate limits. Email or WhatsApp does not automatically attach evidence to a case.'}},
 discounts:{basis:'item subtotal before shipping',comparison:'greater than or equal',automaticNeedsCode:false,validCodeCanCombineWithAutomatic:true,combinedDiscountCappedAtItemSubtotal:true,welcome10:'Only eligible newsletter subscribers using their verified account email. Checkout verifies subscription, expiry, prior use and other code conditions.',finalEligibility:'Checkout rechecks stock, code ownership and all conditions; estimates are not final payment quotes.'},
 support:{email:'support@thesayand.com'},
};
async function snapshot(db,now=Date.now()){
 const [store,a]=await Promise.all([readCatalogue(db),db.ref('mainStore/announcement').once('value').then(s=>s.val())]);
 // Read upcoming drops for verified preorder facts and duplicate detection.
 store.upcomingSales=(await db.ref('mainStore/upcomingSales').once('value')).val()||{};
 const counts=new Map();for(const section of ['newArrivals','trending','sales','upcomingSales'])for(const p of Object.values(store[section]||{}))if(p?.name)counts.set(key(p.name),(counts.get(key(p.name))||0)+1);
 const verified=[];
 for(const raw of products(store)){
  const p=safeProduct(raw,counts.get(key(raw.name))!==1,now);
  const isPreorder=raw.isPreorder===true;
  if(isPreorder)p.price=Number(raw.preorderPrice);
  if((!p.inStock&&!isPreorder)||p.catalogueConflict||!Number.isInteger(p.quantity)||p.quantity<1||!Number.isFinite(p.price)||p.price<=0)continue;
  const sizes=Object.keys(raw.sizeQuantities||{}).length?Object.keys(raw.sizeQuantities).filter(s=>Number.isInteger(Number(raw.sizeQuantities[s]))&&Number(raw.sizeQuantities[s])>0):p.sizes.length?p.sizes:['OS'];
  if(!sizes.length)continue;
  if(raw.sizeQuantities&&Object.values(raw.sizeQuantities).some(v=>!Number.isInteger(Number(v))||Number(v)<0))continue;
  let image;try{const u=new URL(raw.images?.[0]||raw.img);if(u.protocol!=='https:'||u.username||u.password)continue;image=u.href;}catch{continue;}
  const color=p.colors[0]||'Default';
  try{const q=buildQuote({mainStore:store},{userId:'public-example',status:'Pending',items:[{name:raw.name,size:sizes[0],color,quantity:1,...(isPreorder?{isPreorder:true,expectedShipDate:raw.expectedShipDate}:{})}],shippingInfo},'public-example','public-example',now);if(Math.round(q.subtotal*100)!==Math.round(p.price*100))continue;}catch{continue;}
  verified.push({id:raw.route,name:p.name,category:p.category,description:clean(p.description,450),price:p.price,priceCents:Math.round(p.price*100),originalPrice:!isPreorder&&p.isOnSale?p.originalPrice:null,isOnSale:!isPreorder&&p.isOnSale,saleEndDate:isPreorder?null:p.saleEndDate,currency:'EUR',quantity:p.quantity,sizes,colors:p.colors,sizeQuantities:p.sizeQuantities,colorStockKnown:false,productUrl:p.productUrl,image,inStock:!isPreorder,...(isPreorder?{isPreorder:true,isOrderable:true,launchPrice:Number(raw.price),savings:Math.round((Number(raw.price)-p.price)*100)/100,expectedShipDate:raw.expectedShipDate,paymentTiming:'full_payment_now'}:{})});
 }
 const promo=activePromotion(a,now);
 const promotion=promo?{active:true,percent:promo.percent,minimumCents:promo.minimum,minimum:euro(promo.minimum),comparison:'>=',endsAt:promo.ends,endsItaly:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',dateStyle:'long',timeStyle:'short'}).format(promo.ends),endsItalyItalian:new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'long',timeStyle:'short'}).format(promo.ends),automatic:true}: {active:false};
 return {store,facts:{contract:CONTRACT,checkedAt:now,currency:'EUR',promotion,policies:POLICIES,catalogue:{complete:verified.length<=100,totalVerifiedAvailable:verified.length,products:verified.slice(0,100)}}};
}
function history(record){
 // Stored only after the normal private-data guard. No raw provider responses,
 // account identifiers, email addresses or orders are included in this envelope.
 const turns=Array.isArray(record.publicTurns)?record.publicTurns:[];
 const selected=turns.filter(t=>typeof t.question==='string'&&typeof t.answer==='string').slice(-MAX_HISTORY).map(t=>({question:clean(t.question,2000),answer:clean(t.answer,4000),products:Array.isArray(t.products)?t.products.slice(0,3).map(p=>({name:clean(p.name,200),price:p.price})):[]}));
 while(JSON.stringify(selected).length>32000)selected.shift();
 return selected;
}
function remember(record,question,result){return [...history(record),{question,answer:result.answer,products:result.products.map(p=>({name:p.name,price:p.price}))}].slice(-MAX_HISTORY);}
function parse(raw,phase){
 if(typeof raw!=='string'||raw.length>20000)throw Error('Invalid model response');
 const value=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
 if(!value||value.contract!==CONTRACT||value.phase!==phase)throw Error('Dify contract mismatch');
 return value;
}
function calculate(plan,snap,now=Date.now()){
 if(!Array.isArray(plan.tools)||plan.tools.length>3)throw Error('Invalid tool plan');
 return plan.tools.map(t=>{
  if(!t||typeof t!=='object')throw Error('Invalid tool');
  if(t.name==='promotion_eligibility'){
   const subtotal=money(t.subtotal);
   // Facts originate in the current snapshot, not in model-supplied campaign values.
   const promotion=snap.facts.promotion;
   if(!promotion.active||promotion.endsAt<=now)return {name:t.name,active:false,subtotal:euro(subtotal)};
   return {name:t.name,active:true,subtotal:euro(subtotal),minimum:promotion.minimum,meetsMinimum:subtotal>=promotion.minimumCents,shortfall:euro(Math.max(0,promotion.minimumCents-subtotal)),percent:promotion.percent,estimatedItemDiscount:subtotal>=promotion.minimumCents?euro(Math.round(subtotal*promotion.percent/100)):"0.00",estimateOnly:true};
  }
  if(t.name==='arithmetic'){
   if(!Array.isArray(t.values)||t.values.length<2||t.values.length>10)throw Error('Invalid calculation');
   let cents;
   if(t.operation==='multiply'){
    if(t.values.length!==2)throw Error('Invalid multiplication');const qty=Number(t.values[1]);if(!Number.isInteger(qty)||qty<0||qty>10000)throw Error('Invalid quantity');cents=money(t.values[0])*qty;
   }else if(t.operation==='add')cents=t.values.reduce((sum,v)=>sum+money(v),0);
   else if(t.operation==='subtract')cents=t.values.slice(1).reduce((sum,v)=>sum-money(v),money(t.values[0]));
   else throw Error('Unsupported calculation');
   if(!Number.isSafeInteger(cents)||Math.abs(cents)>999999999)throw Error('Calculation too large');
   return {name:t.name,operation:t.operation,values:t.values,result:euro(cents),currency:'EUR',estimateOnly:true};
  }
  if(t.name==='basket'){
   const target=t.target==null?(snap.facts.promotion.active?snap.facts.promotion.minimumCents:null):money(t.target);
   if(target===null)return {name:t.name,needsTarget:true};
   if(target<1||target>1000000)throw Error('Invalid basket target');
   const b=basket(snap.store,target,now);return {name:t.name,target:euro(target),result:b?{subtotal:euro(b.total),lines:b.lines,productIds:b.cards.map(c=>snap.facts.catalogue.products.find(p=>p.name===c.name)?.id).filter(Boolean),reachesTarget:b.total>=target}:null,estimateOnly:true};
  }
  throw Error('Unsupported tool');
 });
}
function finish(value,snap){
 if(typeof value.answer!=='string'||!value.answer.trim()||value.answer.length>6000||!Array.isArray(value.productIds)||value.productIds.length>3)throw Error('Invalid answer');
 const ids=[...new Set(value.productIds)];
 // Recover omitted cards only for unambiguous, full names from the verified public preorder catalogue.
 const words=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const answerWords=' '+words(value.answer)+' ';
 for(const p of snap.facts.catalogue.products){if(ids.length>=3)break;if(p.isPreorder&&answerWords.includes(' '+words(p.name)+' ')&&!ids.includes(p.id))ids.push(p.id);}
 const cards=ids.map(id=>{const p=snap.facts.catalogue.products.find(p=>p.id===id);if(!p)throw Error('Unverified product selection');return {name:p.name,price:p.price,originalPrice:p.originalPrice,isOnSale:p.isOnSale,saleEndDate:p.saleEndDate,currency:p.currency,sizes:p.sizes,colors:p.colors,productUrl:p.productUrl,image:p.image,inStock:p.inStock,...(p.isPreorder?{isPreorder:true,isOrderable:true,launchPrice:p.launchPrice,savings:p.savings,expectedShipDate:p.expectedShipDate,paymentTiming:p.paymentTiming}:{})};});
 return {answer:value.answer.trim(),products:cards,catalogueVerified:true};
}
async function respond({db,record,message,inputs,request,now=Date.now()}){
 const snap=await snapshot(db,now),turns=history(record);
 const old=record.publicContext||{};
 const hint=!turns.length&&['promotion','products','returns','occasion'].includes(old.topic)?{topic:old.topic,subtotal:Number.isFinite(old.subtotal)?old.subtotal:null,names:Array.isArray(old.names)?old.names.slice(0,3).map(n=>clean(n,200)):[]}:null;
 const facts={...snap.facts,catalogue:{...snap.facts.catalogue,products:snap.facts.catalogue.products.map(({image,productUrl,...p})=>p)}};
 const base={contract:CONTRACT,history:turns,legacyPublicTopicHint:hint,facts};
 async function call(phase,extra={}){
  // Let the planning response also finish ordinary questions; calculations still use server tools.
  const context=JSON.stringify({...base,phase,...extra,responseOptimization:{instruction:'For phase plan, when no calculation tools are needed, include tools: [] plus answer (the complete customer reply) and productIds (verified catalogue IDs) in the same plan JSON. This avoids a second AI request. If tools are needed, return the normal tools plan without an answer. Never calculate amounts instead of requesting the server calculation tools.'}});if(context.length>MAX_CONTEXT)throw Error('Conversation context too large');
  // Fresh provider run is intentional: Dify may retain the initial inputs when
  // a conversation_id is reused. Our owned server transcript supplies continuity.
  const result=await request({...inputs,sayand_context:context},phase);
  return parse(result.answer,phase);
 }
 const plan=await call('plan');
 const toolResults=calculate(plan,snap,Date.now());
 const answer=toolResults.length===0&&typeof plan.answer==='string'&&Array.isArray(plan.productIds)?plan:await call('answer',{toolResults});
 // No regex-selected prose replaces the model response. Product cards use only
 // verified server fields; model supplied prices, URLs and images are ignored.
 const current=await snapshot(db);
 // An offer or a recommended item can change while a provider is responding.
 // Reject stale answers instead of displaying their prose beside changed cards.
 if(JSON.stringify(current.facts.promotion)!==JSON.stringify(snap.facts.promotion))throw Error('Promotion changed during response');
 if(JSON.stringify(current.facts.catalogue)!==JSON.stringify(snap.facts.catalogue))throw Error('Catalogue changed during response');
 return finish(answer,current);
}
module.exports={CONTRACT,POLICIES,snapshot,history,remember,parse,calculate,finish,respond};
