'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
let passed=0,failed=0,skipped=0;
for(const file of fs.readdirSync(__dirname).filter(x=>x.endsWith('.cjs')&&x!=='run-consolidated.cjs').sort()){
 if(['services.cjs','elia-semantic-emulator.cjs'].includes(file)&&!process.env.FIREBASE_DATABASE_EMULATOR_HOST){console.log('SKIP '+file+': requires a local Firebase database emulator; never run against production.');skipped++;continue;}
 const r=spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8'});
 console.log(`${r.status===0?'PASS':'FAIL'} ${file}`);if(r.status!==0){console.log(r.stdout,r.stderr,r.error||'');failed++;}else passed++;
}
const release=spawnSync(process.execPath,[path.join(__dirname,'../tools/check-release.cjs')],{encoding:'utf8'});console.log(release.stdout,release.stderr);if(release.status!==0)failed++;
console.log(`${passed} test files passed; ${failed} failures; ${skipped} skipped. Release gate ${release.status===0?'passed':'failed'}.`);process.exitCode=failed?1:0;
