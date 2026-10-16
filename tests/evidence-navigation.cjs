'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
class Node{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];}append(...n){this.children.push(...n);}appendChild(n){this.children.push(n);return n;}replaceChildren(...n){this.children=n;}setAttribute(){}showModal(){this.open=true;}focus(){}}
const body=new Node('body'),document={body,head:new Node('head'),createElement:t=>new Node(t),createTextNode:t=>new Node('text',t)};
let result={url:'https://storage.googleapis.com/private-evidence?signature=test'},failure=null;const navigations=[],calls=[];
const window={location:{assign:u=>navigations.push(u)}};
const context={document,window,SayandServices:{async call(name,data){calls.push({name,data});if(name==='getOrderReturn')return {isClosed:true,case:{status:'Approved',attachments:{a:{status:'ready',name:'photo.png'}}}};if(failure)throw failure;return result;}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/return-conversation.js'),'utf8'),context);
const all=n=>[n,...n.children.flatMap(all)];
(async()=>{await window.openReturnConversation('order-a');const button=all(body).find(n=>n.textContent==='Download photo.png');await button.onclick();assert.deepEqual(navigations,[result.url]);assert.equal(calls.at(-1).data.orderId,'order-a');assert.equal(calls.at(-1).data.attachmentId,'a');failure=Error('Unable to complete the request. Please try again.');await button.onclick();assert.equal(navigations.length,1);assert(all(body).some(n=>n.textContent===failure.message));failure=null;result={url:'javascript:alert(1)'};await button.onclick();assert.equal(navigations.length,1);assert(all(body).some(n=>n.textContent.includes('download link was not returned')));console.log('PASS evidence same-tab navigation, callable failure preserved, non-HTTPS rejected; no popup required');})().catch(e=>{console.error(e);process.exitCode=1;});
