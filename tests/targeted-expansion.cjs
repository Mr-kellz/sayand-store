'use strict';
const assert=require('node:assert/strict'),{boot,all,storage}=require('./elia-ui-harness');
(async()=>{storage.clear();const a=boot('alice');a.find('Ask Elia').click();a.find('Start chatting').click();const long='Helpful specific store advice. '.repeat(30);a.reply(async()=>({answer:long}));a.input().value='Please explain';await a.form().onsubmit({preventDefault(){}});
 const details=all(a.body).find(n=>n.tag==='details'&&n.children[0]?.textContent==='Read full answer');const bubble=all(a.body).find(n=>n.children.includes(details));const flat=n=>n.textContent+n.children.map(flat).join('');assert.equal(flat(bubble.children[0])+flat(details.children[1]),long);
 details.open=true;details.ontoggle();assert.equal(details.children[0].textContent,'Read full answer');assert.equal(details.children[0].hidden,true);const less=details.children.at(-1);assert.equal(less.textContent,'Show less');assert.equal(less.tag,'button');let focused=false;details.children[0].focus=()=>focused=true;less.click();assert.equal(details.open,false);assert.equal(details.children[0].textContent,'Read full answer');assert(focused);
 console.log('PASS actual answer DOM: original text once, Show less after remainder, native disclosure and focus returned after collapse');
})().catch(e=>{console.error(e);process.exitCode=1;});
