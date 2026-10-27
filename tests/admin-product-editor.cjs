'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8');
function element() {
    return { value: '', children: [], listeners: {}, disabled: false,
        replaceChildren() { this.children = []; },
        append(...nodes) { this.children.push(...nodes); },
        appendChild(node) { this.children.push(node); },
        setAttribute() {}, addEventListener(name, handler) { this.listeners[name] = handler; }
    };
}
const nodes = Object.fromEntries(['uploaded-preview', 'prodImgUrl', 'prodImageFile'].map(id => [id, element()]));
let upload = async file => ({ ref: { getDownloadURL: async () => 'https://images/' + file.name } });
const alerts = [];
const context = vm.createContext({
    document: { getElementById: id => nodes[id], createElement: element },
    firebase: { storage: () => ({ ref: () => ({ child: () => ({ put: file => upload(file) }) }) }) },
    FileReader: class { readAsDataURL() { this.onload({ target: { result: 'data:image/jpeg;base64,test' } }); } },
    showAdminToast() {}, alert: message => alerts.push(message)
});
vm.runInContext('let uploadedImages = []; let productImageSession = 0; let productImagesUploading = false; let tempAiImageBase64 = "";\n' + source.slice(source.indexOf('function renderProductImages()'), source.indexOf('function updateDesignPreviews()')), context);
const state = () => JSON.parse(vm.runInContext('JSON.stringify(uploadedImages)', context));
const select = names => nodes.prodImageFile.listeners.change.call(nodes.prodImageFile, { target: { files: names.map(name => ({ name })) } });
const remove = index => nodes['uploaded-preview'].children[index].children[1].listeners.click();
(async () => {
    await select(['a.jpg', 'b.jpg', 'c.jpg']);
    remove(1);
    assert.deepEqual(state(), ['https://images/a.jpg', 'https://images/c.jpg']);
    await select(['d.jpg']);
    assert.deepEqual(state(), ['https://images/a.jpg', 'https://images/c.jpg', 'https://images/d.jpg']);
    await select([]);
    assert.equal(state().length, 3);
    nodes.prodImgUrl.value = 'https://existing/one, https://existing/two';
    nodes.prodImgUrl.listeners.input.call(nodes.prodImgUrl);
    remove(0);
    assert.deepEqual(state(), ['https://existing/two']);
    assert.equal(nodes.prodImgUrl.value, 'https://existing/two');
    remove(0);
    assert.deepEqual(state(), []);
    upload = async file => {
        if (file.name === 'bad.jpg') throw Error('Upload failed');
        return { ref: { getDownloadURL: async () => 'https://images/' + file.name } };
    };
    await select(['good.jpg', 'bad.jpg']);
    assert.deepEqual(state(), ['https://images/good.jpg']);
    assert.equal(alerts.length, 1);
    assert.equal(nodes.prodImageFile.disabled, false);
    let finish;
    upload = () => new Promise(resolve => { finish = resolve; });
    const pending = select(['late.jpg']);
    assert.equal(vm.runInContext('productImagesUploading', context), true);
    vm.runInContext('resetProductImageUpload(); uploadedImages = ["https://other/product"];', context);
    finish({ ref: { getDownloadURL: async () => 'https://images/late.jpg' } });
    await pending;
    assert.deepEqual(state(), ['https://other/product']);
    assert.equal(vm.runInContext('productImagesUploading', context), false);
    const html = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
    for (const id of ['prodPrice', 'salePriceInput', 'upcomingPrice']) {
        const tag = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'))[0];
        assert.match(tag, /type="text"/);
        assert.match(tag, /inputmode="decimal"/);
    }
    vm.runInContext(source.slice(source.indexOf('function parseAdminPrice('), source.indexOf('window.calculateSalePercent =')), context);
    for (const input of ['19.99', '19,99']) assert.equal(vm.runInContext(`parseAdminPrice(${JSON.stringify(input)})`, context), 19.99);
    for (const input of ['', '-1', '19,999', '19.99abc', '1,234.56']) assert(Number.isNaN(vm.runInContext(`parseAdminPrice(${JSON.stringify(input)})`, context)));
    // Exercise the actual save handler through the saved image/price calculation.
    let submit;
    const fields = { prodPrice: { value: '19.99' }, prodName: { value: 'Test' }, prodColors: { value: '' }, 'sizes-inputs': { children: [] } };
    context.document.getElementById = id => id === 'addProductForm' ? { addEventListener: (_, handler) => { submit = handler; } } : fields[id] || { value: '', checked: false };
    const start = source.indexOf("document.getElementById('addProductForm').addEventListener('submit'");
    const end = source.indexOf('    const details = {};', start);
    context.capture = (price, images) => { context.savedPrice = price; context.savedImages = Array.from(images); };
    vm.runInContext(source.slice(start, end) + 'capture(price, finalImages); });', context);
    submit({ preventDefault() {} });
    assert.equal(context.savedPrice, 19.99);
    fields.prodPrice.value = '19,99';
    submit({ preventDefault() {} });
    assert.equal(context.savedPrice, 19.99);
    assert.deepEqual(context.savedImages, ['https://other/product']);
    vm.runInContext('uploadedImages = [];', context);
    const count = alerts.length;
    submit({ preventDefault() {} });
    assert.equal(alerts.length, count + 1);
    console.log('PASS decimal price save; individual removal; appended batches; URL previews; empty selection; partial upload failure; stale upload protection; no restoration of removed images.');
})().catch(error => { console.error(error); process.exitCode = 1; });
