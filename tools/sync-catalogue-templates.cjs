'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
for(const file of ['product.html','collection.html','404.html'])fs.copyFileSync(path.join(root,file),path.join(root,'functions/templates',file));
console.log('Page templates synchronized. This is needed for design/code changes only, not catalogue edits.');
