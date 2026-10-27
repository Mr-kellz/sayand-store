'use strict';
// Inspect errors only. Never expose provider bodies, prompts or credentials.
function classify(status,body,header){
 const text=typeof body==='string'?body.slice(0,32000):'';
 const limited=status===429||((status===400||status===500)&&/rate_limit_exceeded|rate limit reached|too many requests/i.test(text));
 let delay=null;
 const match=text.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
 if(match)delay=Math.ceil(Number(match[1])*1000);
 if(header){const seconds=Number(header);const ms=Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now();if(Number.isFinite(ms))delay=Math.max(delay||0,ms);}
 return {limited,retryMs:delay===null?null:Math.max(1000,delay+250)};
}
async function request(send,{deadline=Date.now()+45000,clock=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),maxWait=25000}={}){
 for(let attempt=0;attempt<2;attempt++){
  const remaining=deadline-clock();if(remaining<1000)throw Object.assign(Error('Elia response deadline reached.'),{code:'unavailable'});
  // Network errors/timeouts are deliberately NOT retried: their outcome is unknown.
  const response=await send(Math.min(20000,remaining));
  if(response.ok)return response.json();
  let body='';try{body=await response.text();}catch{}
  const info=classify(response.status,body,response.headers?.get?.('retry-after'));
  if(info.limited&&attempt===0&&info.retryMs!==null&&info.retryMs<=maxWait&&deadline-clock()>info.retryMs+10000){await sleep(info.retryMs);continue;}
  throw Object.assign(Error(info.limited?'Elia is busy right now. Please wait before trying again; your question is saved.':'Elia is temporarily unavailable. Please try again later.'),{code:info.limited?'resource-exhausted':'unavailable',retryAfterMs:info.retryMs});
 }
}
module.exports={classify,request};
