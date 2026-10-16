'use strict';
const {activePromotion,basketIntent,promotionReply}=require('./elia-promotions');
const {catalogueAnswer,intent,italian,format,normalize}=require('./elia-facts');
// Whole-question match only: possessive wording can still ask a general policy.
function approvalPolicy(message){return /^(?:does|will) (?:approving|approval of) (?:a|my|the) return automatically (?:refund (?:my |the )?(?:money|payment)|issue (?:a |my )?(?:stripe )?refund|initiate (?:a |my )?(?:stripe )?refund)$/.test(normalize(message));}
function promotionOverview(message){
 const q=normalize(message).replace(/\bprom(?:tion|otionn)s?\b/g,'promotion').replace(/^(any|are there any|do you have any) (active|current) sake$/, '$1 $2 sale');
 return /^(?:(?:are|is) there |do you have |have you got |show me |what |which )?(?:any |an? |the |your )?(?:(?:active|current|live|available) )?(?:sales?|promotions?|promos?|offers?|discounts?)(?: (?:are )?(?:active|available|on|today|now|running))*$/.test(q);
}
function operational(message,context={}){
 const q=normalize(message),it=italian(message,context);let en,ita;
 if(/\bwelcome10\b/i.test(message)){en='WELCOME10 is for newsletter subscribers using the same verified email as their SAYAND account. Confirm your newsletter subscription, then apply the code at checkout. Checkout checks the current code conditions and whether you have already used it.';ita='WELCOME10 è riservato agli iscritti alla newsletter con la stessa email verificata dell’account SAYAND. Conferma l’iscrizione e applica il codice al checkout, che verifica le condizioni attuali e l’eventuale utilizzo precedente.';}
 else if(/^(are you (?:a )?(?:human(?: customer service representative)?|person|bot|ai)|who are you|sei (?:umana|umano|un robot)|chi sei)[ ?!.]*$/i.test(message.trim())){en='I’m Elia, SAYAND’s AI shopping assistant. I can help with products, shopping questions and store policies. For personal assistance, contact support@thesayand.com.';ita='Sono Elia, l’assistente AI di SAYAND. Posso aiutarti con prodotti, acquisti e regole del negozio. Per assistenza personale, contatta support@thesayand.com.';}
 else if(approvalPolicy(message)||/^(?:does|will) (?:approving|approval of|an? approved) (?:a )?return (?:automatically )?(?:issue|refund|trigger|send|mean).*[?]?$/.test(q)||/^(?:does approving a return automatically refund my payment|does approving a return automatically issue a refund)$/.test(q)||/approvazione.*reso.*rimborso/.test(q)){en='No. Return approval does not automatically issue a Stripe refund. SAYAND handles eligible refunds separately after the necessary checks.';ita='No. L’approvazione del reso non emette automaticamente un rimborso Stripe. SAYAND gestisce separatamente i rimborsi idonei dopo le verifiche necessarie.';}
 else if(/^(?:how (?:can|do) i track my order|how to track (?:an|my) order|come (?:posso )?tracciare (?:il mio|un) ordine)$/.test(q)){en='Sign in and open My Account → Orders. Open your order to review its status and the tracking information, once SAYAND has provided it.';ita='Accedi a Il mio account → Ordini. Apri l’ordine per vedere lo stato e il tracking, quando SAYAND lo ha inserito.';}
 else if(/^(?:can you access another customer s order|can you see other customers orders)$/.test(q)){en='No. Other customers’ order information is private. I cannot access customer orders; use My Account → Orders for your own order.';ita='No. Gli ordini degli altri clienti sono privati. Per il tuo ordine usa Il mio account → Ordini.';}
 else if(/\b(upload|attachment|evidence|file formats?|heic|pdf|allegati|caricare|formati|foto)\b/.test(q)&&/\b(return|refund|case|portal|file|image|photo|reso|rimborso|foto|allegati)\b/.test(q)){
 en='Open your order’s return conversation → Choose file → select a JPEG, PNG, WebP, MP4 or WebM → Upload file. Maximum 4 MB per file and six files per case. HEIC and PDF are not accepted. Check for a saved-file confirmation or error. If uploads are disabled, send a message for help; if rate-limited, wait until the displayed time and refresh. Email or WhatsApp files are not automatically attached to the case.';
 ita='Apri la conversazione del reso → Scegli file → seleziona JPEG, PNG, WebP, MP4 o WebM → Upload file. Massimo 4 MB per file e sei file per pratica. HEIC e PDF non sono accettati. Controlla la conferma di salvataggio o l’errore. Se gli upload sono disabilitati, invia un messaggio; se hai raggiunto il limite, attendi l’orario indicato e aggiorna. I file via email o WhatsApp non vengono allegati automaticamente.';
 }
 else if(/\b(return shipping|spedizione del reso)\b/.test(q)&&/\b(free|pay|pays|cost|check|gratis|paga|costo)\b/.test(q)){en='SAYAND’s published returns page says SAYAND pays for return shipping. Contact support to arrange the shipment; do not assume a label has already been created.';ita='La pagina resi di SAYAND indica che la spedizione del reso è a carico di SAYAND. Contatta l’assistenza per organizzarla; l’etichetta non viene creata automaticamente.';}
 else if(/\b(return|returns|refund|reso|resi|rimborso)\b/.test(q)&&/\b(policy|policies|days|deadline|when|how|request|delivery|purchase|label|tags|condition|approved|declined|giorni|consegna|richiedere|etichetta|approvato|rifiutato)\b/.test(q)){
 if(/\b(label|labels|etichetta)\b/.test(q)){en='Check your return conversation for SAYAND’s instructions. Contact support if no shipping label or QR code has been provided; approval alone does not create a label.';ita='Controlla le istruzioni di SAYAND nella conversazione del reso. Se manca l’etichetta o il QR, contatta l’assistenza: l’approvazione da sola non crea un’etichetta.';}
 else if(/\b(approved|declined|decision|approvato|rifiutato)\b/.test(q)){en='Approved or declined decisions close the return conversation to new messages and evidence. Existing messages and saved files remain available. Contact support if you need further help; approval does not automatically issue a refund.';ita='Le decisioni di approvazione o rifiuto chiudono la conversazione a nuovi messaggi e allegati. I messaggi e file salvati restano disponibili. Per altro aiuto contatta l’assistenza; l’approvazione non emette automaticamente un rimborso.';}
 else{en='Request a return from My Account → Orders after the order is marked Delivered, within 30 days of its recorded delivery date—not the purchase date. Explain the items, reason and condition. Keep original tags and packaging for review. If the delivery date is missing or the window has passed, contact support.';ita='Richiedi il reso da Il mio account → Ordini dopo lo stato Consegnato, entro 30 giorni dalla data di consegna registrata, non dalla data di acquisto. Indica articoli, motivo e condizioni. Conserva etichette e confezione per la verifica. Se manca la data o il termine è scaduto, contatta l’assistenza.';}
 }
 return en?{answer:it?ita:en,catalogueVerified:true,products:[],context:{language:it?'it':'en'}}:null;
}
// Public operational answers are allowed only when no extra private/action clause is present.
function harmless(message){
 const q=normalize(message);
 return /^(?:is the refund automatic|does approval refund me|e automatico il rimborso)$/.test(q)||approvalPolicy(message)||/^(?:are you (?:a )?(?:human(?: customer service representative)?|person|bot|ai)|who are you|sei (?:umana|umano|un robot)|chi sei|how (?:can|do) i track my order|how to track (?:an|my) order|does approving a return automatically (?:refund my payment|issue a refund)|can you access another customer s order|can you see other customers orders|come (?:posso )?tracciare (?:il mio|un) ordine)$/.test(q);
}
function arithmetic(message,it){
 const q=message.toLowerCase(),words={one:1,two:2,three:3,four:4,five:5,six:6,uno:1,due:2,tre:3,quattro:4,cinque:5};
 const m=q.match(/(?:buy|purchase|compro|acquisto)\s+(\d+|one|two|three|four|five|six|uno|due|tre|quattro|cinque)\s+(?:€|eur\s*)(\d+(?:[.,]\d{1,2})?)/)||q.match(/\b(\d+)\s*[x×*]\s*€?(\d+(?:[.,]\d{1,2})?)/);
 if(!m)return null;const qty=words[m[1]]||Number(m[1]),cents=Math.round(Number(m[2].replace(',','.'))*100);if(!Number.isSafeInteger(qty)||qty<1||!Number.isSafeInteger(qty*cents))return null;
 return {answer:it?`${format(qty*cents/100,true)} prima di sconti e spedizione. È un calcolo esemplificativo, non un preventivo del checkout.`:`${format(qty*cents/100)} before discounts and shipping. This is an arithmetic example, not a verified checkout quote.`,products:[],catalogueVerified:true};
}
async function rawAnswer(db,message,context={}){
 const it=italian(message,context),ops=operational(message,context),math=arithmetic(message,it);if(ops||math)return ops||math;
 const overview=promotionOverview(message),kind=overview?'sales':intent(message,context).kind,q=normalize(message);
 if(basketIntent(message))return promotionReply(db,message);
 const promo=/\b(promo|promotion|promotions|offer|offers|discount|discounts|coupon|coupons|countdown|threshold|minimum|automatic|automatically|promozione|sconto|sconti|soglia|minimo|codice|scade)\b/.test(q)||kind==='sales';
 const product=kind&&kind!=='sales'&&(!promo||kind==='product-sale'||kind==='budget'||kind==='occasion'||/\b(hats?|gowns?|bubu|products?|articoli|prodotti|cappelli)\b/.test(q));
 let productResult=null;
 if(product||kind==='sales'){
  const data={};for(const k of ['newArrivals','trending','sales','upcomingSales'])data[k]=(await db.ref('mainStore/'+k).once('value')).val();
  productResult=catalogueAnswer(data,overview?(it?'Avete saldi?':'Any sales?'):message,context);if(kind!=='sales')return productResult;
 }
 if(!promo)return null;
 const a=(await db.ref('mainStore/announcement').once('value')).val(),p=activePromotion(a);
 let text;
 if(!p)text=overview?(it?'Al momento non è pubblicata una promozione automatica attiva al checkout.':'There’s no active automatic checkout offer listed right now.'):(it?'Non posso confermare una promozione automatica attiva al momento.':'I can’t confirm an active automatic promotion right now.');
 else{
  const minimum=format(p.minimum/100,it),subtotal=message.match(/(?:subtotal|subtotale)(?:\s+(?:is|of|è|di))?\s*(?:€|eur\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  if(subtotal){const cents=Math.round(Number(subtotal[1].replace(',','.'))*100),yes=cents>=p.minimum;
   text=it?(yes?`Sì, ${format(cents/100,true)} raggiunge il minimo di ${minimum}.`:`No, mancano ${format((p.minimum-cents)/100,true)} al minimo di ${minimum}.`):(yes?`Yes, ${format(cents/100)} meets the ${minimum} minimum.`:`No, you are ${format((p.minimum-cents)/100)} below the ${minimum} minimum.`);
   text+=it?' Il checkout conferma le altre condizioni e lo sconto finale.':' Checkout confirms the remaining eligibility conditions and final discount.';
  }else if(/\b(shipping included|spedizione inclusa)\b/.test(q)){text=it?'La soglia riguarda il subtotale degli articoli, prima della spedizione. Il checkout verifica lo sconto finale.':'The minimum applies to the item subtotal, before shipping. Checkout verifies the final discount.';
  }else if(/\b(stack|stacking|combine|combined|together|codici|combinare|cumulabile)\b/.test(q))text=it?'Il checkout può sommare un codice valido allo sconto automatico, fino al subtotale degli articoli. Il codice deve superare i controlli di scadenza, utilizzo e titolarità. Il checkout conferma il risultato.':'Checkout can combine a valid code with the automatic discount, capped at the item subtotal. The code must pass expiry, redemption and ownership checks. Checkout confirms the result.';
  else if(/\b(expire|expiry|expires|end|ends|until|countdown|scade|scadenza|finisce|italy|italia)\b/.test(q)){const end=new Intl.DateTimeFormat(it?'it-IT':'en-GB',{timeZone:'Europe/Rome',dateStyle:'long',timeStyle:'short'}).format(new Date(p.ends));text=it?`La promozione termina il ${end}, ora italiana.`:`The promotion ends on ${end}, Italy local time.`;}
  else if(/\b(automatic|automatically|code|codice|automatico|automaticamente)\b/.test(q))text=it?`Lo sconto automatico del ${p.percent}% si applica da ${minimum} di subtotale articoli. Non serve un codice; il checkout conferma l’idoneità.`:`The ${p.percent}% automatic discount applies at an item subtotal of ${minimum} or more. No code is needed; checkout confirms eligibility.`;
  else text=it?`È attiva una promozione automatica del ${p.percent}% da ${minimum} di subtotale articoli, importo incluso. Il checkout conferma lo sconto finale.`:`The current automatic offer is ${p.percent}% off at an item subtotal of ${minimum} or more, including exactly ${minimum}. Checkout confirms the final discount.`;
 }
 return {catalogueVerified:true,products:productResult?.products||[],answer:text+(productResult?'\n'+(productResult.products.length?productResult.answer+(it?' Puoi vedere tutti i saldi su https://thesayand.com/sales.':' Browse all sale products at https://thesayand.com/sales.'):(it?' Non risultano prodotti pubblici disponibili attualmente ribassati.':'There are no available public products with a current markdown.')):''),context:{language:it?'it':'en'}};
}
async function answer(db,message,context={}){
 const flow=require('./elia-context'),resolved=flow.resolve(message,context);
 const result=resolved.clarify?{answer:resolved.clarify,products:[],catalogueVerified:true}:await rawAnswer(db,resolved.question,flow.fresh(context));
 if(result)result.context=flow.remember(message,result,context,resolved);
 return result;
}
module.exports={answer,operational,harmless,arithmetic,approvalPolicy,promotionOverview};
