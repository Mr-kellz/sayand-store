'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'js/service-config.js'),'utf8'),context);
const config=context.window.SAYAND_SERVICE_CONFIG || {};
if(!/^[A-Za-z0-9_-]{20,}$/.test(config.appCheckSiteKey || ''))throw Error('Set your PUBLIC reCAPTCHA Enterprise site key in js/service-config.js before deployment. New protected customer services need App Check.');
for(const file of ['product.html','collection.html','404.html']) {
 if(fs.readFileSync(path.join(root,file),'utf8')!==fs.readFileSync(path.join(root,'functions/templates',file),'utf8'))throw Error('Run node tools/sync-catalogue-templates.cjs before deployment.');
}
console.log('Public service configuration and catalogue templates checked. Complete the manual release checklist before deploying.');
