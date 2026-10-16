(() => {
 'use strict';
 const el=(tag,value)=>{const n=document.createElement(tag);if(value)n.textContent=value;return n;};
 const button=(label,fn)=>{const n=el('button',label);n.type='button';n.onclick=fn;return n;};
 let dialog, orderId, status, content, focused, loadVersion=0;
 async function call(name,data={},target=orderId) {return SayandServices.call(name,{orderId:target,...data});}
 async function run(fn) {
  try {status.textContent='Working…';const confirmation=await fn();status.textContent=typeof confirmation==='string'?confirmation:'';if(confirmation)status.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
  catch(e){status.textContent=e.message || 'Please try again.';status.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
 }
 function field(parent,label,node) {const wrap=el('label',label);wrap.appendChild(node);parent.appendChild(wrap);return node;}
 function select(values) {const n=el('select');values.forEach(v=>{const o=el('option',v);o.value=v;n.appendChild(o);});return n;}
 async function load() {
  const version=++loadVersion;
  const data=await call('getOrderReturn');if(version!==loadVersion)return;content.replaceChildren();
  if(!data.case) {
   if(!data.canRequest){content.appendChild(el('p','New return requests are available for 30 days after the recorded delivery date. If that date is missing or the window has passed, please contact support@thesayand.com for help.'));return;}
   const form=el('form');const reason=field(form,'Reason',select(['Size or fit','Damaged item','Wrong item','Changed my mind','Other']));
   const condition=field(form,'Item condition',select(['Unworn with tags','Opened or tried on','Damaged on arrival','Other']));
   const detail=field(form,'Which items are you returning, and why?',el('textarea'));detail.required=true;detail.minLength=10;detail.maxLength=2000;
   form.appendChild(el('p','Optional photos or a short video can be added after submitting. SAYAND will review your request and reply here.'));
   const send=el('button','Submit return request');send.type='submit';form.appendChild(send);
   form.onsubmit=e=>{e.preventDefault();run(async()=>{send.disabled=true;try{await call('openOrderReturn',{reason:reason.value,condition:condition.value,detail:detail.value});await load();}finally{send.disabled=false;}});};content.appendChild(form);return;
  }
  const c=data.case;content.appendChild(el('h3',c.status));content.appendChild(el('p',c.reason+' · '+c.condition));
  const messages=el('section');messages.className='sayand-return-messages';messages.setAttribute('aria-label','Return conversation');messages.setAttribute('role','log');
  Object.values(c.messages || {}).sort((a,b)=>a.createdAt-b.createdAt).forEach(m=>{const p=el('p');p.className='sayand-return-bubble '+(m.role==='customer'?'from-customer':'from-sayand');p.append(el('strong',m.role==='customer'?'Customer: ':'SAYAND: '),document.createTextNode(m.text));if(Number.isFinite(m.createdAt)){const stamp=el('small',new Date(m.createdAt).toLocaleString());p.append(stamp);}messages.appendChild(p);});content.appendChild(messages);
  const readyFiles=Object.values(c.attachments||{}).filter(a=>a.status==='ready');
  content.appendChild(el('h3','Saved evidence'));content.appendChild(el('p',readyFiles.length?readyFiles.length+' saved file(s). View them here or download a copy.':'No evidence files have been saved to this case. Selecting a file does not upload it.'));
  if(Object.values(c.attachments||{}).some(a=>a.status==='uploading'))content.appendChild(el('p','An upload is awaiting confirmation. Refresh the conversation; if it remains pending, contact support.'));
  Object.entries(c.attachments || {}).filter(([,a])=>a.status==='ready').forEach(([id,a])=>{
   const previewBox=el('div');previewBox.className='sayand-evidence-preview';
   const view=button('View '+(a.name || 'evidence'),()=>run(async()=>{
    if(view.disabled)return;view.disabled=true;const target=orderId,version=loadVersion;
    try {
     const {url,mime}=await call('viewReturnEvidence',{attachmentId:id,preview:true},target);
     if(target!==orderId||version!==loadVersion)return;
     if(typeof url!=='string'||!/^https:\/\//i.test(url)||!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(mime))throw Error('Preview is unavailable. Please use Download.');
     const media=el(mime.startsWith('image/')?'img':'video');media.src=url;
     if(mime.startsWith('image/'))media.alt=a.name||'Return evidence';
     else{media.controls=true;media.playsInline=true;media.preload='metadata';}
     const note=el('p');note.setAttribute('role','status');
     media.onerror=()=>{note.textContent='The preview could not load. Close it and select View again for a fresh link, or use Download.';};
     const closePreview=button('Close preview',()=>{media.pause?.();media.removeAttribute?.('src');media.load?.();previewBox.replaceChildren();view.hidden=false;view.focus();});
     previewBox.replaceChildren(media,note,closePreview);view.hidden=true;closePreview.focus();previewBox.scrollIntoView?.({block:'nearest',behavior:'smooth'});
    }finally{view.disabled=false;}
   }));
   content.appendChild(view);
   content.appendChild(button('Download '+(a.name || 'evidence'),()=>run(async()=>{const {url}=await call('viewReturnEvidence',{attachmentId:id});if(typeof url!=='string'||!/^https:\/\//i.test(url))throw Error('The evidence download link was not returned. Please try again.');window.location.assign(url);})));content.appendChild(previewBox);
  });
  if(data.isClosed||c.closedAt||['Approved','Declined','Refunded','Closed'].includes(c.status)){content.appendChild(el('p','A final decision has been made. This conversation is now read-only. You can still view messages and download existing files. For further help, contact support@thesayand.com.'));return;}
  if(data.uploadsEnabled===false){content.appendChild(el('p','File uploads are currently unavailable. You can still send a message below, or contact support@thesayand.com about evidence.'));}
  else if(Number.isFinite(data.uploadRetryAt)&&data.uploadRetryAt>Date.now()){content.appendChild(el('p','Upload limit reached. You can upload again after '+new Date(data.uploadRetryAt).toLocaleString()+'. Use Refresh conversation after that time. You can still send a message below.'));}
  else {
   const upload=field(content,'Add evidence — up to 6 files, 4 MB each',el('input'));upload.type='file';upload.accept='.jpg,.jpeg,.png,.webp,.mp4,.webm,image/jpeg,image/png,image/webp,video/mp4,video/webm';
   content.appendChild(el('p','Choose a JPEG, PNG or WebP image, or a short MP4/WebM video, then press Upload file. For an iPhone HEIC photo, export it as JPEG first. PDFs are not supported.'));
   const selected=el('p','No file selected.');content.appendChild(selected);
   const uploadButton=button('Upload file',()=>run(async()=>{if(upload.disabled)return;const target=orderId;const file=upload.files?.[0];if(!file)throw Error('Choose a file first.');if(file.size>4*1024*1024)throw Error('This file is over 4 MB. Please export a smaller image or shorten the video.');upload.disabled=true;uploadButton.disabled=true;try{const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(Error('The selected file could not be read. Please choose it again.'));r.readAsDataURL(file);});const result=await call('attachReturnEvidence',{base64,mime:file.type,name:file.name},target);if(target!==orderId)return;if(result.success!==true)throw Error('Upload was not confirmed. Refresh the conversation before retrying.');await load();return 'File saved to this return case: '+file.name+'. It is available to you and SAYAND under Saved evidence.';}finally{upload.disabled=false;uploadButton.disabled=false;}}));
   uploadButton.disabled=true;upload.onchange=()=>{const file=upload.files?.[0];selected.textContent=file?file.name+' · '+(file.size/1024/1024).toFixed(2)+' MB':'No file selected.';uploadButton.disabled=!file;};content.appendChild(uploadButton);
  }
  const form=el('form');const message=field(form,'Message to '+(data.isAdmin?'customer':'SAYAND'),el('textarea'));message.maxLength=2000;message.required=true;const send=el('button','Send message');send.type='submit';form.appendChild(send);form.onsubmit=e=>{e.preventDefault();run(async()=>{send.disabled=true;try{await call('replyOrderReturn',{message:message.value});await load();}finally{send.disabled=false;}});};content.appendChild(form);
  if(data.isAdmin){const decision=field(content,'Review decision',select(['More information needed','Approved','Declined']));content.appendChild(el('p','Approval updates the return workflow. It does not issue a Stripe refund. Write your decision and next steps in the message box.'));content.appendChild(button('Save review decision',()=>run(async()=>{await call('reviewOrderReturn',{decision:decision.value,message:message.value});await load();})));}
 }
 window.openReturnConversation=async id=>{
  ++loadVersion;orderId=id;focused=document.activeElement;
  if(!dialog){dialog=el('dialog');dialog.className='sayand-return-dialog';dialog.setAttribute('aria-label','Return request and conversation');const close=button('Close',()=>{++loadVersion;dialog.close();content.replaceChildren();focused?.focus();});dialog.append(close,el('h2','Return request'));status=el('p');status.setAttribute('role','status');status.className='sayand-return-status';content=el('div');dialog.append(status,content,button('Refresh conversation',()=>run(load)));document.body.appendChild(dialog);const style=el('style');style.textContent='.sayand-return-dialog{width:min(620px,92vw);max-height:85vh;overflow:auto;padding:24px;border:1px solid #c2c9c0;background:#f9f6f0;color:#1a2e15}.sayand-return-dialog::backdrop{background:#0008}.sayand-return-dialog label{display:block;margin:16px 0}.sayand-return-dialog textarea,.sayand-return-dialog select,.sayand-return-dialog input{display:block;width:100%;padding:10px;border:1px solid #c2c9c0}.sayand-return-dialog textarea{min-height:90px}.sayand-return-dialog p{margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}.sayand-return-dialog button{padding:10px;margin:5px;border:1px solid #1a2e15}.sayand-return-dialog h2{font-weight:bold;font-size:22px}';document.head.appendChild(style);}
  document.head.appendChild(theme);content.replaceChildren();if(!dialog.open)dialog.showModal();await run(load);
 };
 const theme=el('style');theme.textContent=`
 .sayand-return-dialog{font:14px/1.6 Arial,sans-serif;width:min(620px,94vw);max-height:88dvh;border:1px solid #c7a443;border-radius:20px;padding:26px;background:#f9f6f0;box-shadow:0 24px 70px #0005}
 .sayand-return-dialog .sayand-return-status{position:sticky;top:0;z-index:2;background:#f9f6f0;border-left:3px solid #c7a443;padding:10px;box-shadow:0 2px 6px #0002}
 .sayand-return-dialog .sayand-return-status:empty{display:none}
 .sayand-return-dialog h2{font-size:24px;letter-spacing:1px;padding:18px;margin:0 0 20px;background:#1a2e15;color:#e1bd53;border-radius:12px}
 .sayand-return-dialog h3{display:inline-block;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;border:1px solid #c7a443;padding:6px 12px;border-radius:20px}
 .sayand-return-dialog button{border-radius:9px;background:#1a2e15;color:#f9f6f0;padding:11px 16px;font-weight:bold;cursor:pointer}
 .sayand-return-dialog>button:first-child{float:right;background:transparent;color:#1a2e15;padding:6px 12px}
 .sayand-return-dialog button:disabled{opacity:.55;cursor:wait}
 .sayand-return-dialog label{font-size:13px;font-weight:bold}
 .sayand-return-dialog textarea,.sayand-return-dialog select,.sayand-return-dialog input{border-radius:10px;background:white;color:#1a2e15;font:16px/1.5 Arial,sans-serif;margin-top:6px}
 .sayand-return-dialog textarea{resize:vertical}
 .sayand-return-dialog .sayand-return-messages{padding:16px;background:#eaece3;border-radius:14px;max-height:340px;overflow:auto;margin:20px 0}
 .sayand-return-dialog .sayand-return-bubble{max-width:88%;width:fit-content;padding:12px 16px;border-radius:16px;margin:0 0 14px;white-space:pre-wrap}
 .sayand-return-dialog .from-customer{margin-left:auto;background:#1a2e15;color:#f9f6f0;border-bottom-right-radius:4px}
 .sayand-return-dialog .from-sayand{margin-right:auto;background:#fffaf0;color:#1a2e15;border:1px solid #d4c69c;border-bottom-left-radius:4px}
 .sayand-return-dialog .sayand-return-bubble strong{display:block;font-size:11px;letter-spacing:1px;margin-bottom:5px}
 .sayand-return-dialog .sayand-return-bubble small{display:block;font-size:10px;margin-top:8px;opacity:.8}
 .sayand-return-dialog .sayand-evidence-preview img,.sayand-return-dialog .sayand-evidence-preview video{display:block;max-width:100%;max-height:55dvh;object-fit:contain;margin:12px auto;border-radius:10px}
 .sayand-return-dialog :focus-visible{outline:2px solid #a5832e;outline-offset:3px}
 @media(max-width:480px){.sayand-return-dialog{padding:16px}.sayand-return-dialog .sayand-return-bubble{max-width:94%}}
 `;document.head.appendChild(theme);
})();
