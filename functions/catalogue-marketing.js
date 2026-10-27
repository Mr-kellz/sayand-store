'use strict';
const crypto = require('node:crypto');
const ORIGIN = 'https://thesayand.com';
const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const money = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value) * 100) / 100 : null;
const count = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const values = value => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
function images(p) { return values(p.images || [p.img]).filter(url => {try {return new URL(url).protocol === 'https:';} catch (_) {return false;}}); }
function price(p, now = Date.now()) {
    if (p.isPreorder) return money(p.preorderPrice) > 0 ? money(p.preorderPrice) : null;
    const regular = money(p.price), sale = money(p.salePrice);
    // Match the storefront and checkout's sale expiry rule.
    return sale !== null && (!p.saleEndDate || Date.parse(p.saleEndDate) > now) ? sale : regular;
}
function stock(p, size) {
    if (p.isOutOfStock || p.catalogueConflict) return 'out_of_stock';
    const total = count(p.quantity);
    if (total === null) return null;
    if (total === 0) return 'out_of_stock';
    if (p.sizeQuantities && Object.keys(p.sizeQuantities).length) {
        const quantities = size ? [count(p.sizeQuantities[size])] : Object.values(p.sizeQuantities).map(count);
        if (quantities.some(q => q !== null && q > 0)) return 'in_stock';
        if (quantities.some(q => q === null)) return null;
        return 'out_of_stock';
    }
    return 'in_stock';
}
const id = p => 'sayand-' + crypto.createHash('sha256').update(p.name.normalize('NFKC').trim().toLowerCase()).digest('hex').slice(0,20);
function gender(p) { return p.merchant?.gender || ({women:'female',men:'male'}[p.category]) || ''; }
function validGtin(value) {
    if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value || '')) return false;
    const digits = [...value].map(Number), last = digits.pop();
    return (10 - digits.reverse().reduce((sum,n,i) => sum + n * (i % 2 ? 1 : 3), 0) % 10) % 10 === last;
}
function productSchema(p, now, size) {
    const image = images(p), sellingPrice = price(p, now), availability = stock(p,size);
    const data = {'@context':'https://schema.org','@type':'Product','@id':ORIGIN+p.route+'#product',name:p.name,url:ORIGIN+p.route};
    if (image.length) data.image = image;
    if (text(p.description)) data.description = text(p.description);
    if (text(p.merchant?.brand)) data.brand = {'@type':'Brand',name:text(p.merchant.brand)};
    if (validGtin(p.merchant?.gtin)) data.gtin = p.merchant.gtin;
    if (text(p.merchant?.mpn)) data.mpn = text(p.merchant.mpn);
    if (size) data.size = size;
    if (values(p.colors).length === 1 && !/^default$/i.test(p.colors[0])) data.color = text(p.colors[0]);
    // Don't advertise an offer when its price, image or stock is unknown.
    if (sellingPrice !== null && availability && image.length && !p.catalogueConflict && (!p.isPreorder || (money(p.preorderPrice)>0 && money(p.preorderPrice)<=money(p.price) && /^\d{4}-\d{2}-\d{2}$/.test(p.expectedShipDate || '') && Date.parse(p.expectedShipDate+'T23:59:59Z')>=now))) {
        data.offers = {'@type':'Offer',url:ORIGIN+p.route,priceCurrency:'EUR',price:sellingPrice.toFixed(2),availability:'https://schema.org/'+(availability==='in_stock'?(p.isPreorder?'PreOrder':'InStock'):'OutOfStock'),seller:{'@type':'Organization',name:'SAYAND',url:ORIGIN}};
    }
    if (data.offers && ['new','used','refurbished'].includes(p.merchant?.condition)) data.offers.itemCondition = 'https://schema.org/'+({new:'NewCondition',used:'UsedCondition',refurbished:'RefurbishedCondition'}[p.merchant.condition]);
    return data;
}
function jsonLd(value) { return '<script type="application/ld+json">'+JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')+'</script>'; }
function merchantIssues(p) {
    const issues = [], m = p.merchant || {}, sizes = values(p.sizes), colors = values(p.colors);
    if (p.catalogueConflict) issues.push('Duplicate product name');
    if (!text(p.description)) issues.push('Product description');
    if (!images(p).length) issues.push('HTTPS product image');
    if (money(p.price) === null) issues.push('Valid regular price');
    if (stock(p) === null) issues.push('Known stock quantity');
    if (p.isPreorder) issues.push('Preorders need an availability date and are not exported');
    if (!sizes.length) issues.push('Size');
    if (colors.length !== 1 || /^default$/i.test(colors[0])) issues.push('One actual colour per product (colour variants need separate inventory)');
    if (!['male','female','unisex'].includes(gender(p))) issues.push('Gender');
    if (!['newborn','infant','toddler','kids','adult'].includes(m.ageGroup)) issues.push('Age group');
    if (!['new','used','refurbished'].includes(m.condition)) issues.push('Condition');
    if (m.gtin && !validGtin(m.gtin)) issues.push('Valid GTIN barcode');
    if (sizes.length > 1 && m.gtin) issues.push('A distinct barcode per size variant');
    if (m.identifierExists !== false && !(text(m.brand) && (validGtin(m.gtin) || text(m.mpn)))) issues.push('Brand and GTIN/MPN, or confirm no manufacturer identifiers');
    if (m.identifierExists === false && (m.gtin || m.mpn)) issues.push('Identifier setting conflicts with barcode/MPN');
    if (sizes.length > 1 && !p.sizeQuantities) issues.push('Stock for each size');
    if (p.sizeQuantities && sizes.some(s => count(p.sizeQuantities[s]) === null)) issues.push('Valid stock for each size');
    return issues;
}
function merchantFeed(products, now = Date.now()) {
    const rows = [], excluded = [];
    for (const p of products) {
        const issues = merchantIssues(p);
        if (issues.length) { excluded.push({name:p.name,issues}); continue; }
        const m = p.merchant || {}, group = id(p), sizes = values(p.sizes);
        for (const size of sizes) {
            const variant = group+'-'+crypto.createHash('sha256').update(size).digest('hex').slice(0,8);
            const url = new URL(ORIGIN+p.route); url.searchParams.set('size',size);
            const fields = {id:variant,title:p.name,description:text(p.description).slice(0,5000),link:url.href,image_link:images(p)[0],availability:stock(p,size),price:money(p.price).toFixed(2)+' EUR',condition:m.condition,google_product_category:'166',product_type:text(p.category),size,color:values(p.colors)[0],gender:gender(p),age_group:m.ageGroup};
            if (sizes.length > 1) fields.item_group_id = group;
            const sale = price(p,now);
            if (sale !== money(p.price)) fields.sale_price = sale.toFixed(2)+' EUR';
            if (text(m.brand)) fields.brand = text(m.brand);
            if (validGtin(m.gtin)) fields.gtin = m.gtin;
            if (text(m.mpn)) fields.mpn = text(m.mpn);
            if (m.identifierExists === false) fields.identifier_exists = 'no';
            // Match the standard Italy checkout rate. Dispatch/transit times are
            // intentionally omitted until the shop has confirmed its courier schedule.
            const shipping = '<g:shipping><g:country>IT</g:country><g:price>5.00 EUR</g:price></g:shipping>';
            rows.push('<item>'+Object.entries(fields).map(([k,v])=>`<g:${k}>${xml(v)}</g:${k}>`).join('')+shipping+images(p).slice(1,11).map(u=>`<g:additional_image_link>${xml(u)}</g:additional_image_link>`).join('')+'</item>');
        }
    }
    return {body:'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>SAYAND products</title><link>'+ORIGIN+'</link><description>Current public SAYAND catalogue</description>'+rows.join('')+'</channel></rss>',count:rows.length,excluded};
}
module.exports = {text,xml,money,price,stock,images,productSchema,jsonLd,merchantFeed,merchantIssues,validGtin};
