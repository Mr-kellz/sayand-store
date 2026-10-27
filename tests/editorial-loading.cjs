'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../lookbook.html'), 'utf8');
const start = html.indexOf('        if (typeof firebase');
const script = html.slice(start, html.indexOf('</script>', start));
const nodes = {};
const element = () => ({ style: {}, innerHTML: '', innerText: '' });
const data = { footer: { about: null, shipping: { title: 'Shipping', content: 'Delivery details' } }, siteContent: { lbHeroImg: 'https://example.com/hero.jpg', lbWomenImg: 'https://example.com/women.jpg' }, lookbook: [{ id: 'test', title: 'Editorial', description: 'Story', urls: ['https://example.com/cover.jpg'] }] };
let result;
vm.runInNewContext(script, {
    firebase: { database: {} },
    window: { SayandPublicStore: { once: () => ({ then: callback => { result = callback({ val: () => data }); } }) } },
    document: { getElementById: id => nodes[id] ||= element(), createElement: element, body: { appendChild() {} } },
    SayandI18n: { registerCatalog() {}, contentHTML: value => value, fieldTranslations: () => ({}) }
});
assert.match(nodes['lb-hero-media'].innerHTML, /hero.jpg/);
assert.match(nodes['lb-women-media'].innerHTML, /women.jpg/);
assert.match(nodes['magazine-feed'].innerHTML, /cover.jpg/);
assert.match(nodes['translation-prerender'].innerHTML, /Shipping/);
assert.doesNotMatch(nodes['translation-prerender'].innerHTML, /prerender-about/);
console.log('PASS editorial hero, collection images and article cover render with a missing footer entry.');
