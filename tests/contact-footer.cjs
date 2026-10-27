'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../js/main.js'),'utf8');
const script = source.slice(source.indexOf('let CONTACT ='),source.indexOf('window.showContact ='));
for (const hasFooterLink of [false,true]) {
 const nodes = Object.fromEntries(['contact-email','contact-whatsapp','contact-ig','social-ig','social-tk','social-pt','social-handle',...(hasFooterLink?['contact-link']:[])].map(id=>[id,{}]));
 const context={window:{},document:{getElementById:id=>nodes[id]||null}};
 vm.runInNewContext(script,context);
 context.window.updateContactInfo({contact:{email:'support@example.com',whatsapp:'+39123',instagram:'https://instagram.com/shop',tiktok:'https://tiktok.com/@shop',pinterest:'https://pinterest.com/shop'}});
 assert.equal(nodes['contact-email'].href,'mailto:support@example.com');
 assert.equal(nodes['social-handle'].innerText,'@shop');
 if(hasFooterLink)assert.equal(nodes['contact-link'].href,'mailto:support@example.com');
}
console.log('PASS contact update with and without the optional footer link');
