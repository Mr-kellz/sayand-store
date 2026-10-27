'use strict';
// Read a supplied catalogue snapshot locally; never read or write production here.
const fs = require('node:fs');
const {products} = require('../functions/catalogue');
const {merchantFeed} = require('../functions/catalogue-marketing');
const file = process.argv[2];
if (!file) throw Error('Usage: node tools/check-shopping-readiness.cjs /path/to/catalogue.json');
const data = JSON.parse(fs.readFileSync(file,'utf8'));
const result = merchantFeed(products(data));
console.log(JSON.stringify({eligibleVariants:result.count,excluded:result.excluded},null,2));
