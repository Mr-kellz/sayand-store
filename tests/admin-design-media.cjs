'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/admin.js'), 'utf8');
const fields = {};
const database = {siteContent: { editImg: 'https://example.com/one.mp4, https://example.com/two.mp4', editTitle: 'Editorial' }};
const context = {database, window: {}, document: {getElementById: id => fields[id] ||= {value: ''}}, updateDesignPreviews() {}, renderHomepageSlides() {}, generateCode() {}};
vm.runInNewContext(source.slice(source.indexOf('function loadDesignForm()'), source.indexOf('function loadContactForm()')), context);
context.loadDesignForm();
assert.equal(fields.editImg.value, database.siteContent.editImg);
fields.editTitle.value = 'Updated editorial';
fields.editImg.value = ''; // Old/stale hidden field must never erase the carousel.
context.window.updateDesign();
assert.equal(database.siteContent.editImg, 'https://example.com/one.mp4, https://example.com/two.mp4');
assert.equal(database.siteContent.editTitle, 'Updated editorial');
console.log('PASS design edits preserve existing carousel video links even with a stale hidden input.');
