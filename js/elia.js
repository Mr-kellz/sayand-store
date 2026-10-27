(() => {
 'use strict';
 if(!window.SAYAND_SERVICE_CONFIG?.eliaEnabled || document.getElementById('sayand-elia'))return;
 function formatEliaAnswer(value){
  const frag=document.createDocumentFragment();
  const text=String(value??'')
   .replace(/\r\n?/g,'\n')
   .replace(/^\s{0,3}#{1,6}\s+/gm,'')
   .replace(/^\s*[-*]\s+/gm,'• ');
  const pattern=/\[([^\]\n]{1,140})\]\((https:\/\/[^\s)]+)\)|\*\*([^*\n]{1,160})\*\*|(https:\/\/[^\s<>()]+)/g;
  let last=0,match;
  while((match=pattern.exec(text))){
   frag.appendChild(document.createTextNode(text.slice(last,match.index)));
   if(match[3]){
    frag.appendChild(el('strong',match[3]));
   }else{
    const url=match[2]||match[4];
    let trusted=false;
    try{
     const u=new URL(url);
     trusted=u.protocol==='https:' &&
      ['thesayand.com','www.thesayand.com'].includes(u.hostname) &&
      !u.username && !u.password;
    }catch{}
    if(trusted){
     const link=el('a',match[1]||url);
     link.href=url;
     link.rel='noopener noreferrer';
     frag.appendChild(link);
    }else{
     frag.appendChild(document.createTextNode(match[0]));
    }
   }
   last=pattern.lastIndex;
  }
  frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
 }

 const KEY='sayand-elia-session-v2',TTL=24*60*60*1000;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const btn=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
 let owner=null,state=null,busy=false,generation=0,catalogue=[];
 function verifiedCards(value){return (Array.isArray(value)?value:[]).filter(p=>{
  if(!p||(p.inStock!==true&&!(p.isPreorder===true&&p.isOrderable===true))||typeof p.name!=='string'||typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<0)return false;
  try{const u=new URL(p.productUrl);return u.protocol==='https:'&&u.hostname==='thesayand.com'&&!u.username&&!u.password&&u.pathname.startsWith('/product-');}catch{return false;}
 }).slice(0,3);}
 const fresh=()=>({owner,expires:Date.now()+TTL,consent:false,open:false,token:null,messages:[]});
 function save(){if(!state)return;try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch{}}
 function restore(){try{const x=JSON.parse(sessionStorage.getItem(KEY));if(x?.owner===owner && x.expires>Date.now() && x.expires<=Date.now()+TTL && Array.isArray(x.messages)){return {...x,token:/^[a-f0-9]{64}$/.test(x.token)?x.token:null,messages:x.messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-40).map(m=>({role:m.role,text:m.text.slice(0,12000),...(m.role==='assistant'?{products:verifiedCards(m.products)}:{}),...(m.role==='user'&&/^[a-f0-9]{64}$/.test(m.requestId)?{requestId:m.requestId,status:m.status==='pending'?'uncertain':m.status,error:m.error||''}:{})})),consent:x.consent===true,open:x.open===true};}}catch{}return fresh();}
 const root=el('section');root.id='sayand-elia';
 // Preserve Elia's spacing above the existing WhatsApp launcher.
 if(document.getElementById('whatsapp-float'))root.className='elia-with-whatsapp';
 const toggle=btn('Ask Elia',()=>{state.open=!state.open;save();render();if(state.open)(state.consent?input:start).focus();});toggle.disabled=true;toggle.setAttribute('aria-expanded','false');
 const panel=el('section');panel.className='elia-panel';panel.hidden=true;panel.setAttribute('aria-label','Elia shopping assistant');
 const header=el('header'),brand=el('div'),icon=el('span','◯');icon.className='elia-icon';icon.setAttribute('aria-hidden','true');brand.append(el('h2','ELIA'),el('p','SAYAND Personal Shopping Assistant'));
 const close=btn('×',()=>{state.open=false;save();render();toggle.focus();});close.setAttribute('aria-label','Close Elia');header.append(icon,brand,close);
 const welcome=el('div');welcome.className='elia-welcome';welcome.append(el('h3','How can I help you today?'),el('p','Explore the collection, find your size, or ask about delivery and returns.'));
 const start=btn('Start chatting',()=>{state.consent=true;save();render();loadCatalogue();input.focus();});welcome.append(start);
 const notice=el('p','Your AI shopping assistant. Please don’t share passwords, payment details or addresses. For private order help, use My Orders.');notice.className='elia-notice';welcome.append(notice);
 const log=el('div');log.className='elia-log';log.setAttribute('role','log');log.setAttribute('aria-live','polite');log.setAttribute('aria-label','Conversation with Elia');
 const form=el('form');form.className='elia-form';const input=el('textarea');input.placeholder='Ask Elia anything…';input.maxLength=2000;input.required=true;input.rows=1;input.setAttribute('aria-label','Message to Elia');
 const send=el('button','↑');send.type='submit';send.setAttribute('aria-label','Send message');form.append(input,send);
 const status=el('p');status.className='elia-notice';status.setAttribute('role','status');
 const footer=el('div');footer.className='elia-footer';const reset=btn('New chat',()=>{if(busy)return;state={...fresh(),consent:state.consent,open:true};generation++;save();render();input.focus();});
 const orders=el('a','My Orders');orders.href='/dashboard';const privacy=el('details'),summary=el('summary','Chat privacy');privacy.append(summary,el('p','Elia is an AI assistant, not a person. Messages are processed by Dify and its model provider to generate replies. This tab keeps your chat for up to 24 hours so you can move between SAYAND pages. New chat or signing out clears this tab’s saved conversation; it does not delete provider records. Avoid sharing personal or payment information.'));const policy=el('a','Privacy policy');policy.href='/privacy';privacy.append(policy);footer.append(reset,orders,privacy);
 panel.append(header,welcome,log,status,form,footer);root.append(toggle,panel);document.body.appendChild(root);
 const words=s=>normal(s).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const normal=s=>String(s||'').normalize('NFKC').toLowerCase();
 const number=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 function card(p){const card=el('a');card.className='elia-product';card.href=p.productUrl;const src=p.image;try{const u=new URL(src);if(u.protocol==='https:'&&!u.username&&!u.password){const img=el('img');img.src=u.href;img.alt=p.name;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();card.append(img);}}catch{}
  const info=el('div');info.append(el('strong',p.name));const price=number(p.price),original=number(p.originalPrice);
  const fmt=v=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(v);
  if(p.isPreorder===true){
   info.append(el('small','PREORDER · PAY IN FULL NOW'));
   if(number(p.launchPrice)!==null)info.append(el('small','Launch price '+fmt(p.launchPrice)));
  }
  if(p.isPreorder!==true&&p.isOnSale===true&&original!==null&&price!==null&&original>price&&(!p.saleEndDate||Date.parse(p.saleEndDate)>Date.now())){const before=el('del',fmt(original));before.setAttribute('aria-label','Original price '+fmt(original));info.append(before);}
  if(price!==null){const current=el('b',fmt(price));current.setAttribute('aria-label','Current price '+fmt(price));info.append(current);}
  if(p.isPreorder===true){
   if(number(p.savings)>0)info.append(el('small','Save '+fmt(p.savings)));
   if(/^\d{4}-\d{2}-\d{2}$/.test(p.expectedShipDate||'')&&Number.isFinite(Date.parse(p.expectedShipDate)))info.append(el('small','Estimated dispatch: '+new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(p.expectedShipDate))));
  }
  info.append(el('small',[...(Array.isArray(p.sizes)?p.sizes:[]),...(Array.isArray(p.colors)?p.colors:[])].join(' · ')),el('span','View product ↗'));card.append(info);return card;
 }
 function render(){if(!state)return;panel.hidden=!state.open;toggle.setAttribute('aria-expanded',String(state.open));welcome.hidden=state.consent;log.hidden=!state.consent;form.hidden=!state.consent;reset.disabled=busy;send.disabled=busy;log.replaceChildren();
  for(const m of state.messages){const bubble=el('div');bubble.className='elia-bubble elia-'+m.role;bubble.setAttribute('aria-label',m.role==='user'?'You':'Elia');const message=el('p');
   if(m.role==='assistant'&&m.text.length>450){const word=m.text.lastIndexOf(' ',400),cut=word>0?word:400;message.append(formatEliaAnswer(m.text.slice(0,cut)));const more=el('details'),summary=el('summary','Read full answer');more.append(summary);const remainder=el('p');remainder.append(formatEliaAnswer(m.text.slice(cut)));const less=btn('Show less',()=>{more.open=false;summary.hidden=false;summary.textContent='Read full answer';summary.focus();summary.scrollIntoView?.({block:'nearest'});});less.className='elia-collapse';more.append(remainder,less);more.ontoggle=()=>{summary.hidden=more.open;summary.textContent='Read full answer';};bubble.append(message,more);}else{message.append(formatEliaAnswer(m.text));bubble.append(message);}
   if(m.role==='user'&&m.status&&m.status!=='done'){
    const label=el('small',m.status==='pending'?'Sending…':m.error||'Reply interrupted or unconfirmed.');bubble.append(label);
    if(m.status!=='pending'&&m.requestId){const retry=btn('Retry',()=>submit(m,true));retry.disabled=busy;retry.setAttribute('aria-label','Retry or check reply for: '+m.text.slice(0,100));bubble.append(retry);}
   }
   if(m.role==='assistant')for(const p of verifiedCards(m.products))bubble.append(card(p));log.append(bubble);
  }
  if(busy){const thinking=el('div','Elia is thinking…');thinking.className='elia-bubble elia-assistant';log.append(thinking);}log.scrollTop=log.scrollHeight;
 }
 async function loadCatalogue(){/* Cards arrive with the verified server answer, not name matches. */}
 function requestId(){const crypto=window.crypto||globalThis.crypto;if(!crypto?.getRandomValues)return null;return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');}
 async function submit(m,retry=false){
  if(busy||!state?.consent)return;const version=generation;busy=true;m.status='pending';m.error='';status.textContent='';save();render();
  try{
   let result;
   if(retry){result=await SayandServices.call('eliaChat',{operation:'status',requestId:m.requestId});if(version!==generation)return;}
   if(!result||result.requestStatus==='not_found'||(result.requestStatus==='retryable'&&result.retryAt<=Date.now()))result=await SayandServices.call('eliaChat',{message:m.text,conversationToken:state.token,...(m.requestId?{requestId:m.requestId}:{})});
   if(version!==generation)return;
   if(['pending','uncertain','retryable'].includes(result.requestStatus)){m.status='uncertain';m.error=result.answer||'The reply is still processing. Retry checks its status without sending it again.';}
   else{if(/^[a-f0-9]{64}$/.test(result.conversationToken))state.token=result.conversationToken;m.status='done';state.messages.push({role:'assistant',text:String(result.answer||'').slice(0,12000),products:result.catalogueVerified===true?verifiedCards(result.products):[]});state.messages=state.messages.slice(-40);}
   save();
  }catch(error){if(version!==generation)return;m.status='uncertain';m.error=error.message||'Reply failed or unconfirmed. Use Retry to check it safely.';status.textContent=m.error;save();}
  finally{if(version===generation){busy=false;render();}}
 }
 form.onsubmit=async e=>{e.preventDefault();if(!state?.consent||busy)return;if(state.expires<=Date.now()){state={...fresh(),open:true};save();render();return;}
  const message=input.value.trim();if(!message||message.length>2000)return;const m={role:'user',text:message,requestId:requestId()};state.messages.push(m);state.messages=state.messages.slice(-40);input.value='';await submit(m);
 };
 panel.onkeydown=e=>{if(e.key==='Escape')close.click();};
 window.addEventListener('pagehide',()=>{if(busy&&state){generation++;busy=false;for(const m of state.messages)if(m.role==='user'&&m.status==='pending'){m.status='uncertain';m.error='The reply was interrupted. Retry checks whether it completed without sending twice.';}}save();});
 window.addEventListener('pageshow',()=>{render();});
 firebase.auth().onAuthStateChanged(user=>{const next=user?.uid||'guest';if(next===owner)return;generation++;const changed=owner!==null;owner=next;busy=false;catalogue=[];status.textContent='';input.value='';if(changed){try{sessionStorage.removeItem(KEY);}catch{}}state=changed?fresh():restore();save();toggle.disabled=false;render();if(state.consent)loadCatalogue();});
 const style=el('style');style.textContent=`
 #sayand-elia{position:fixed;right:16px;bottom:calc(22px + env(safe-area-inset-bottom));z-index:10000;font:14px/1.5 Arial,sans-serif;color:#f7f2e7}#sayand-elia *{box-sizing:border-box}#sayand-elia [hidden]{display:none!important}#sayand-elia button{cursor:pointer;font:inherit}#sayand-elia button:disabled{opacity:.55;cursor:wait}#sayand-elia>button{padding:13px 20px;border:1px solid #c7a443;border-radius:28px;background:#112c1e;color:#e3c15f;font-weight:bold;box-shadow:0 8px 25px #0003}
 #sayand-elia.elia-with-whatsapp{bottom:calc(96px + env(safe-area-inset-bottom));}#sayand-elia.elia-with-whatsapp .elia-panel{height:min(630px,calc(100dvh - 190px));}#sayand-elia .elia-panel{position:absolute;right:0;bottom:62px;width:min(420px,calc(100vw - 32px));height:min(630px,calc(100dvh - 115px));display:flex;flex-direction:column;overflow:hidden;border:1px solid #456044;border-radius:26px;background:#10291c;box-shadow:0 20px 55px #0005}#sayand-elia header{display:flex;align-items:center;gap:12px;margin:0 20px;padding:22px 0;border-bottom:1px solid #41583d;flex-shrink:0}#sayand-elia h2{color:#e1bd53;font-size:24px;letter-spacing:1px;font-weight:bold;margin:0}#sayand-elia header p{margin:0;font-size:12px;color:#f2eedf}#sayand-elia header>button{margin-left:auto;border:0;background:none;color:#f2eedf;font-size:28px;padding:4px}#sayand-elia .elia-icon{display:grid;place-items:center;flex-shrink:0;width:46px;height:46px;border-radius:50%;background:#c7a443;color:#10291c;font-size:32px}
 #sayand-elia .elia-welcome{padding:24px;overflow:auto;flex:1}#sayand-elia h3{font-size:22px;line-height:1.3;margin:0 0 12px}#sayand-elia .elia-welcome>button{background:#c7a443;color:#10291c;border:0;border-radius:12px;padding:12px 18px;margin:18px 0;font-weight:bold}#sayand-elia .elia-notice{font-size:12px;color:#ccc9b7;margin:8px 20px}#sayand-elia .elia-welcome .elia-notice{margin:8px 0}
 #sayand-elia .elia-log{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:20px;scroll-padding-bottom:20px}#sayand-elia .elia-bubble{width:fit-content;max-width:94%;padding:14px 16px;border-radius:20px;margin-bottom:16px;white-space:pre-wrap;overflow-wrap:anywhere}#sayand-elia .elia-bubble p{margin:0}#sayand-elia .elia-user{background:#375237;color:white;margin-left:auto;border-bottom-right-radius:5px}#sayand-elia .elia-assistant{background:#f5f0e5;color:#193525;border-bottom-left-radius:5px}#sayand-elia .elia-product{display:flex;gap:12px;text-decoration:none;color:#193525;margin-top:14px;white-space:normal}#sayand-elia .elia-product img{width:82px;height:110px;object-fit:cover;border-radius:10px;background:#e9e6df}#sayand-elia .elia-product div{min-width:0;display:flex;flex-direction:column;gap:5px}#sayand-elia .elia-product b{font-size:22px}#sayand-elia .elia-product del{font-size:13px;color:#66735e}#sayand-elia .elia-collapse{display:block;margin-top:12px;padding:4px 0;border:0;background:transparent;color:#725615;text-decoration:underline}#sayand-elia .elia-bubble summary{color:#725615}#sayand-elia .elia-user>button{display:block;margin-top:8px;padding:6px 12px;border:1px solid #c7a443;border-radius:8px;background:#f5f0e5;color:#193525}#sayand-elia .elia-product small{color:#51644e}#sayand-elia .elia-product span{color:#8b6b20;text-decoration:underline}
 #sayand-elia .elia-form{display:flex;gap:10px;align-items:center;background:#f7f3e9;margin:0 18px 10px;padding:10px;border-radius:16px;flex-shrink:0}#sayand-elia textarea{background:transparent;color:#193525;border:0;resize:vertical;min-height:44px;max-height:90px;min-width:0;flex:1;font:16px/1.5 Arial;padding:10px}#sayand-elia .elia-form button{background:#c7a443;color:#10291c;border:0;border-radius:13px;width:44px;height:44px;font-size:24px}#sayand-elia .elia-footer{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:0 20px 16px;font-size:11px;flex-shrink:0}#sayand-elia .elia-footer button{background:none;color:#ded5b4;border:0;padding:4px 0}#sayand-elia .elia-footer a,#sayand-elia summary{color:#ded5b4;cursor:pointer}#sayand-elia .elia-footer details[open]{flex-basis:100%;max-height:120px;overflow:auto}#sayand-elia .elia-bubble details[open]{max-height:none;overflow:visible}#sayand-elia .elia-bubble details[open]>summary{display:none!important}#sayand-elia .elia-log{touch-action:pan-y;-webkit-overflow-scrolling:touch}#sayand-elia details p{margin:8px 0}#sayand-elia :focus-visible{outline:2px solid #dfbf62;outline-offset:3px}
 `;document.head.appendChild(style);
 if(window.visualViewport){const fit=()=>{const v=window.visualViewport,keyboard=window.innerHeight-v.height>150;panel.style.maxHeight=Math.max(180,v.height-(keyboard?16:90))+'px';panel.style.position=keyboard?'fixed':'';panel.style.top=keyboard?(v.offsetTop+8)+'px':'';panel.style.bottom=keyboard?'auto':'';panel.style.right=keyboard?'16px':'';};window.visualViewport.addEventListener('resize',fit);window.visualViewport.addEventListener('scroll',fit);fit();}

})();

/* SAYAND Elia scroll correction 2026-10-12 */
