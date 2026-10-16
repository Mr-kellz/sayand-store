'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(require('node:path').join(__dirname,'../js/main.js'),'utf8');
const code=src.slice(src.indexOf('function announcementText('),src.indexOf('function loadAnnouncement()'));
let height=64,observed,styles=[],value,resize;const bar={dataset:{},getBoundingClientRect:()=>({height})};
const ctx={document:{getElementById:()=>bar,head:{appendChild:s=>styles.push(s.textContent)},createElement:()=>({}),documentElement:{style:{setProperty:(k,v)=>{assert.equal(k,'--sayand-announcement-height');value=v;}}}},window:{addEventListener:(e,f)=>resize=f},ResizeObserver:class{constructor(f){observed=f;}observe(n){assert.equal(n,bar);}}};
vm.runInNewContext(code+'observeAnnouncementLayout();',ctx);assert.equal(value,'64px');height=96;observed();assert.equal(value,'96px');height=32;resize();assert.equal(value,'32px');height=0;observed();assert.equal(value,'0px');vm.runInNewContext('observeAnnouncementLayout();',ctx);assert.equal(styles.length,1);assert(styles[0].includes('overflow-wrap:anywhere'));assert(styles[0].includes('white-space:nowrap'));console.log('PASS wrapped mobile banner measured at 64/96px, resize/hidden height updates and observer installed once (DOM simulation)');

assert.equal(vm.runInNewContext("announcementText('€150AT CHECKOUT')",Object.assign(ctx,{})), '€150 AT CHECKOUT');
