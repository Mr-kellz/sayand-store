'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const marketing = require('./catalogue-marketing');
const ORIGIN = 'https://thesayand.com';
const SECTIONS = ['newArrivals', 'trending', 'sales', 'upcomingSales'];
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = v => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const key = v => String(v || '').normalize('NFKC').trim().toLowerCase();
const slug = v => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'item';
function number(v) { return (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null; }
function visible(p) { return p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim() && !p.isVipOnly && !p.isHidden && !p.isDraft; }
function products(data) {
  const byName = new Map(), counts = new Map();
  for (const section of SECTIONS) for (const p of Object.values(data[section] || {})) {
    if (p && typeof p.name === 'string') counts.set(key(p.name), (counts.get(key(p.name)) || 0) + 1);
  }
  for (const section of SECTIONS) for (const p of Object.values(data[section] || {})) {
    if (visible(p) && !byName.has(key(p.name))) byName.set(key(p.name), p);
  }
  const list = [...byName.values()].sort((a,b) => key(a.name).localeCompare(key(b.name), 'en'));
  const groups = new Map();
  for (const p of list) { const s = slug(p.name); groups.set(s, (groups.get(s) || 0) + 1); }
  return list.map(p => ({...p, ...(counts.get(key(p.name)) > 1 ? {catalogueConflict:true} : {}), route:'/product-' + slug(p.name) + (groups.get(slug(p.name)) > 1 ? '-' + crypto.createHash('sha256').update(key(p.name)).digest('hex').slice(0,8) : '')}));
}
function metadata(html, title, description, route, image, marker) {
  html = html.replace(/<title>.*?<\/title>/s, '<title>' + escape(title) + '</title>')
    .replace(/<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+|sayand-product|sayand-category)"[^>]*>/g,'')
    .replace(/<link\s+rel="canonical"[^>]*>/g,'');
  const tags = [['description',description],['og:type','website'],['og:title',title],['og:description',description],['og:url',ORIGIN+route],['twitter:card','summary_large_image'],['twitter:title',title],['twitter:description',description]];
  if (typeof image === 'string' && /^https:\/\//.test(image)) tags.push(['og:image',image],['twitter:image',image]);
  return html.replace('<head>', '<head>\n<base href="/">\n'+marker+'\n<link rel="canonical" href="'+escape(ORIGIN+route)+'">\n'+tags.map(([k,v])=>'<meta '+(k.startsWith('og:')?'property':'name')+'="'+k+'" content="'+escape(v)+'">').join('\n'));
}
const categoryLabels = {women:'Women’s Clothing',men:'Men’s Collection',accessories:'Accessories'};
const staticRoutes = ['/', '/collection','/sales','/lookbook','/faq','/shipping','/returns','/privacy','/terms','/cookie'];
function render(data, pathname, templates, options = {}) {
  const now = options.now ?? Date.now();
  const list = products(data);
  const categories = [...new Set([...Object.keys(categoryLabels), ...list.map(p=>plain(p.category).toLowerCase()).filter(Boolean)])];
  if (pathname === '/api/public-preorders') {
    const fields = ['name','price','preorderPrice','expectedShipDate','description','details','images','image','img','category','sizes','sizeQuantities','colors','quantity','isOutOfStock','isPreorder','translations'];
    const drops = products({upcomingSales:data.upcomingSales}).map(p=>Object.fromEntries(fields.filter(k=>p[k] !== undefined).map(k=>[k,p[k]])));
    return {status:200,type:'application/json',body:JSON.stringify(drops)};
  }
  if (pathname === '/merchant-feed.xml') {
    return {status:200,type:'application/xml',body:marketing.merchantFeed(list,now).body};
  }
  if (pathname === '/sitemap.xml') {
    const routes = [...staticRoutes, ...categories.map(c=>'/collection-'+slug(c)), ...list.map(p=>p.route)];
    return {status:200,type:'application/xml',body:'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+routes.map(r=>'<url><loc>'+escape(ORIGIN+r)+'</loc></url>').join('')+'</urlset>'};
  }
  if (pathname === '/api/catalogue-routes') return {status:200,type:'application/json',body:JSON.stringify(Object.fromEntries(list.map(p=>[key(p.name),p.route])))};
  let html;
  const p = list.find(p=>p.route === pathname);
  if (p) {
    const description = (plain(p.description) || 'Shop '+p.name+' at SAYAND. Discover sizes, details and delivery information.').slice(0,170);
    html = metadata(templates.product,'SAYAND | '+p.name,description,p.route,p.images?.[0] || p.img,'<meta name="sayand-product" content="'+escape(p.name)+'">');
    const requestedSize = Array.isArray(p.sizes) && p.sizes.includes(options.size) ? options.size : undefined;
    html = html.replace('</head>',marketing.jsonLd(marketing.productSchema(p,now,requestedSize))+'</head>');
    const sellingPrice = marketing.price(p,now), availability = marketing.stock(p,requestedSize);
    const setContent = (id, content) => { html = html.replace(new RegExp('(<([a-z][a-z0-9]*)[^>]*\\bid="'+id+'"[^>]*>)[\\s\\S]*?(</\\2>)','i'), (_,open,tag,close) => open+content+close); };
    setContent('detail-name',escape(p.name));
    setContent('detail-description',escape(plain(p.description) || 'Premium quality fashion piece from SAYAND.'));
    setContent('detail-price',sellingPrice === null ? '' : p.isPreorder ? '<span class="block text-xs">Launch price €'+Number(p.price).toFixed(2)+'<br><strong>Preorder €'+sellingPrice.toFixed(2)+'</strong>'+(Number(p.price)>sellingPrice?'<br>Save €'+(Number(p.price)-sellingPrice).toFixed(2):'')+'</span>' : '€'+sellingPrice.toFixed(2));
    setContent('detail-stock',availability === 'in_stock' ? (p.isPreorder ? 'Preorder — pay now, estimated dispatch '+escape(p.expectedShipDate || 'to be confirmed') : 'In stock') : availability === 'out_of_stock' ? 'Out of stock' : '');
    const primaryImage = marketing.images(p)[0];
    if (primaryImage) html = html.replace(/<img\b[^>]*id="detail-hero-img"[^>]*>/, tag => tag.replace(/src="[^"]*"/, 'src="'+escape(primaryImage)+'"').replace(/alt="[^"]*"/,'alt="'+escape(p.name)+'"'));
    html = html.replace('</body>','<noscript><section><h1>'+escape(p.name)+'</h1><p>'+escape(description)+'</p><p>Enable JavaScript for current availability and checkout.</p><a href="/collection">Shop collections</a></section></noscript></body>');
  } else {
    const c = categories.find(c=>'/collection-'+slug(c) === pathname);
    if (!c) return {status:404,type:'text/html',body:templates.notFound};
    const title = categoryLabels[c] || plain(c);
    const selected = list.filter(p=>plain(p.category).toLowerCase() === c);
    html = metadata(templates.collection,'SAYAND | '+title,'Explore '+title+' at SAYAND. Browse current styles, sizes and availability.',pathname,selected[0]?.images?.[0] || selected[0]?.img,'<meta name="sayand-category" content="'+escape(c)+'">');
    html = html.replace(/(<h1 id="collection-page-title"[^>]*>)[\s\S]*?<\/h1>/, (_,open)=>open+escape(title)+'</h1>');
    const card = p => {
      const image = marketing.images(p)[0], sellingPrice = marketing.price(p,now);
      const date=/^\d{4}-\d{2}-\d{2}$/.test(p.expectedShipDate || '') && Number.isFinite(Date.parse(p.expectedShipDate)) ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(p.expectedShipDate)) : 'To be confirmed';
      const price = p.isPreorder ? '<p>Launch price €'+Number(p.price).toFixed(2)+(sellingPrice===null?'<br>Preorder price coming soon':'<br><strong>Preorder €'+sellingPrice.toFixed(2)+'</strong>'+(Number(p.price)>sellingPrice?'<br>Save €'+(Number(p.price)-sellingPrice).toFixed(2):''))+'</p><p class="preorder-dispatch">Estimated dispatch: '+escape(date)+'<br>Pay in full when you preorder.</p>' : sellingPrice===null?'':'<p>€'+sellingPrice.toFixed(2)+'</p>';
      return '<a href="'+escape(p.route)+'" class="block"><div class="relative">'+(image ? '<img loading="lazy" src="'+escape(image)+'" alt="'+escape(p.name)+'" class="w-full aspect-[3/4] object-cover">' : '')+(p.isPreorder?'<span class="preorder-badge">PREORDER</span>':'')+'</div><h2 class="text-xs font-bold mt-3">'+escape(p.name)+'</h2>'+price+'</a>';
    };
    const current=selected.filter(p=>!p.isPreorder), drops=selected.filter(p=>p.isPreorder);
    const cards=drops.length ? (current.length?'<section class="collection-current"><h2 class="collection-section-title">CURRENT COLLECTION</h2><div class="collection-section-grid">'+current.map(card).join('')+'</div></section>':'')+'<section class="collection-preorders" aria-label="Preorder drops"><header><p class="collection-section-kicker">COMING SOON · RESERVE YOUR PIECE</p><h2 class="collection-section-title">PREORDER DROPS</h2><p class="collection-section-description">Pay now for a future release. Each drop shows its preorder price and estimated dispatch date.</p></header><div class="collection-section-grid">'+drops.map(card).join('')+'</div></section>' : current.map(card).join('');
    html = html.replace(/(<div id="collection-page-grid"[^>]*>)\s*<div[^>]*>Loading products\.\.\.<\/div>/, (_,open)=>open+cards);
    html = html.replace('</body>','<noscript><section><h1>'+escape(title)+'</h1>'+selected.map(p=>'<p><a href="'+escape(p.route)+'">'+escape(p.name)+'</a></p>').join('')+'</section></noscript></body>');
  }
  return {status:200,type:'text/html',body:html};
}
async function readCatalogue(db, includePreorders = false) { return Object.fromEntries(await Promise.all((includePreorders ? SECTIONS : SECTIONS.filter(s=>s!=='upcomingSales')).map(async s=>[s,(await db.ref('mainStore/'+s).once('value')).val() || {}]))); }
function handler(db) {
  const templates = Object.fromEntries([['product','product.html'],['collection','collection.html'],['notFound','404.html']].map(([k,file])=>[k,fs.readFileSync(path.join(__dirname,'templates',file),'utf8')]));
  return async (req,res) => {
    res.set('Cache-Control','no-store');
    if (!['GET','HEAD'].includes(req.method)) return res.status(405).set('Allow','GET, HEAD').send('Method not allowed');
    try {
      const url = new URL(req.originalUrl || req.url, ORIGIN);
      const pathname = url.pathname.replace(/\.html$/,'');
      const data = await readCatalogue(db, true);
      if(pathname.startsWith('/api/'))res.set('X-Robots-Tag','noindex');
      if(pathname === '/product') {
        const p=products(data).find(p=>key(p.name)===key(url.searchParams.get('item')));
        if(p)return res.redirect(302,p.route);
        // Preserve the existing member-only product UI without indexing VIP pages.
        const memberItem=SECTIONS.flatMap(s=>Object.values(data[s] || {})).find(p=>p && p.isVipOnly && !p.isHidden && !p.isDraft && key(p.name)===key(url.searchParams.get('item')));
        if(memberItem)return res.type('text/html').send(templates.product.replace('<head>','<head><base href="/"><meta name="robots" content="noindex,nofollow"><meta name="sayand-product" content="'+escape(memberItem.name)+'">'));
        return res.status(404).type('text/html').send(templates.notFound);
      }
      const result = render(data,pathname,templates,{size:url.searchParams.get('size')});
      if (pathname === '/merchant-feed.xml') res.set('X-Robots-Tag','noindex');
      return res.status(result.status).type(result.type).send(result.body);
    } catch (e) { console.error('Catalogue unavailable',e.code || 'internal'); return res.status(503).set('Retry-After','30').send('The shop is temporarily unavailable. Please try again.'); }
  };
}
module.exports = {products,render,handler,readCatalogue,number,visible,slug,key};
