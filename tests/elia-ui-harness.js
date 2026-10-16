'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/elia.js'),'utf8');
class Node{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.attrs={};this.hidden=false;this.value='';this.style={};}append(...ns){this.children.push(...ns);}appendChild(n){this.children.push(n);return n;}replaceChildren(...ns){this.children=ns;}setAttribute(k,v){this.attrs[k]=v;}focus(){}click(){return this.onclick?.();}remove(){}}
const all=n=>[n,...n.children.flatMap(all)],text=n=>all(n).map(x=>x.textContent).join(' ');
const storage=new Map();let clock=Date.now();
function boot(uid=null){let auth;const calls=[];const body=new Node('body'),head=new Node('head'),events={};const document={body,head,createElement:t=>new Node(t),createTextNode:t=>new Node('text',t),createDocumentFragment:()=>new Node('fragment'),getElementById:id=>all(body).find(n=>n.id===id)};
const viewport={height:800,offsetTop:0,addEventListener:(k,f)=>events['viewport-'+k]=f};const window={crypto:require('node:crypto').webcrypto,innerHeight:800,visualViewport:viewport,SAYAND_SERVICE_CONFIG:{eliaEnabled:true},addEventListener:(k,f)=>events[k]=f,SayandPublicStore:{once:async()=>({val:()=>({newArrivals:[{name:'BUBU GOWN',price:40,sizes:['One Size'],colors:['Mix Colour'],images:['https://example.test/gown.jpg']},{name:'HAT',price:20},{name:'SECRET',price:5,isVipOnly:true}],trending:[],sales:[]})})}};
let fetchReply=async()=>({answer:'Here is an available option. **Lovely** <img onerror=evil()>',catalogueVerified:true,products:[{name:'BUBU GOWN',price:40,inStock:true,productUrl:'https://thesayand.com/product-bubu-gown',image:'https://example.test/gown.jpg',sizes:['One Size'],colors:['Mix Colour']}],conversationToken:'a'.repeat(64)});
const ctx={window,document,URL,Intl,Date:class extends Date{static now(){return clock;}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},firebase:{auth:()=>({onAuthStateChanged:f=>{auth=f;f(uid?{uid}:null);}})},SayandServices:{call:async(n,d)=>{calls.push({n,d});return fetchReply();}}};
vm.createContext(ctx);vm.runInContext(source,ctx);return {body,head,calls,events,viewport,auth:u=>auth(u?{uid:u}:null),reply:f=>fetchReply=f,find:label=>all(body).find(n=>n.textContent===label),form:()=>all(body).find(n=>n.tag==='form'),input:()=>all(body).find(n=>n.tag==='textarea')};}
const tick=()=>new Promise(r=>setImmediate(r));
module.exports={boot,all,text,storage,tick};
