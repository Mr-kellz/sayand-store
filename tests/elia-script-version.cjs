'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!['node_modules','.git'].includes(e.name)?walk(path.join(p,e.name)):e.isFile()?[path.join(p,e.name)]:[]);
let count=0;for(const f of walk(root).filter(f=>f.endsWith('.html'))){const source=fs.readFileSync(f,'utf8');if(source.includes('/js/elia.js')){count++;assert(!source.includes('src="/js/elia.js"'),f);assert(source.includes('/js/elia.js?v=20261015-expanded'),f);}}
assert(count>=18);const ui=fs.readFileSync(path.join(root,'js/elia.js'),'utf8');assert(!ui.includes("'Full answer'"));assert(ui.includes('details[open]>summary{display:none!important}'));console.log('PASS versioned Elia references across '+count+' pages/templates; expanded summary explicitly hidden and old label absent');
