'use strict';

// Payment-specific validation. This module never accepts a browser price as authoritative.
const SECTIONS = ['newArrivals', 'trending', 'sales', 'upcomingSales'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
function fail(message) { const error = new Error(message); error.code = 'failed-precondition'; throw error; }
function money(value) {
    const number = Number(value);
    if (value === null || value === '' || !Number.isFinite(number) || number < 0) fail('Invalid price configuration. Please contact support.');
    const cents = Math.round(number * 100);
    if (!Number.isSafeInteger(cents)) fail('Invalid price configuration.');
    return cents;
}
function text(value, max = 250) {
    if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f]/.test(value)) fail('Please check the information entered at checkout.');
    return value.trim();
}
function catalog(store, name) {
    const matches = [];
    for (const section of SECTIONS) {
        for (const [key, product] of Object.entries(store[section] || {})) {
            if (product && product.name === name) matches.push({section, key, product});
        }
    }
    if (matches.length !== 1) fail(`Please contact support: ${name} is unavailable or has duplicate catalogue entries.`);
    return matches[0];
}
function purchased(order) {
    return Boolean(order && (order.paymentDate || order.stripeSessionId) && !/cancel|refund/i.test(order.status || ''));
}
function buildQuote(root, order, orderId, uid, now) {
    if (!order || order.userId !== uid) fail('Order not found in your account.');
    if (order.status !== 'Pending') fail('This order is no longer awaiting payment.');
    const store = root.mainStore || {};
    const past = Object.values(root.orders || {}).filter(o => o.userId === uid && purchased(o));
    const active = Object.entries(root.checkoutQuotes || {}).filter(([id,q]) => id !== orderId && q.expiresAt > now && !(root.paymentFulfillments || {})[id]).map(([,q])=>q);
    const ownActive = active.filter(q=>q.userId === uid);
    let vip = 0;
    for (const [threshold, count, percent, limit] of [[700,10,10,2],[500,6,6,1],[200,3,3,1]]) {
        const eligible = past.filter(o=>Number(o.totalAmount) >= threshold).length >= count;
        const used = past.filter(o=>o.vipDiscountPercent === percent).length + ownActive.filter(q=>q.vipDiscountPercent === percent).length;
        if (eligible && used < limit) { vip = percent; break; }
    }
    const isVip = past.filter(o=>Number(o.totalAmount) >= 200).length >= 3;
    const entries = Object.values(order.items || {});
    if (!entries.length || entries.length > 50) fail('Your bag must contain between 1 and 50 items.');
    const items = [], quantities = new Map(), sizeQuantities = new Map();
    let subtotal = 0;
    for (const item of entries) {
        const name = text(item.name, 200), size = text(item.size || 'OS', 80);
        const color = text(item.color || 'Default', 80);
        const quantity = Number(item.quantity === undefined ? item.qty : item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) fail('Please choose a valid quantity.');
        const {product:p} = catalog(store, name);
        if (p.isHidden || p.isDraft || p.isOutOfStock) fail(`${name} is not available for immediate checkout.`);
        if (p.isVipOnly && !isVip) fail(`${name} requires VIP membership.`);
        const sizes = Object.keys(p.sizeQuantities || {});
        if (sizes.length ? !own(p.sizeQuantities,size) : (Array.isArray(p.sizes) && !p.sizes.includes(size))) fail(`Please choose a valid size for ${name}.`);
        if (Array.isArray(p.colors) && p.colors.length && !p.colors.includes(color)) fail(`Please choose a valid colour for ${name}.`);
        const sale = p.salePrice && (!p.saleEndDate || Date.parse(p.saleEndDate) > now);
        if (p.isPreorder && (!Number.isFinite(Number(p.preorderPrice)) || Number(p.preorderPrice)<=0 || Number(p.preorderPrice)>Number(p.price) || !/^\d{4}-\d{2}-\d{2}$/.test(p.expectedShipDate || '') || !Number.isFinite(Date.parse(p.expectedShipDate)) || new Date(p.expectedShipDate).toISOString().slice(0,10)!==p.expectedShipDate || Date.parse(p.expectedShipDate+'T23:59:59Z')<now)) fail(`${name} is not available for paid preorder until its price, capacity and dispatch date are configured. Please contact support.`);
        if (p.isPreorder && (item.isPreorder !== true || item.expectedShipDate !== p.expectedShipDate)) fail('Preorder details have changed. Refresh checkout and review the dispatch date before paying.');
        const cents = money(p.isPreorder ? p.preorderPrice : sale ? p.salePrice : p.price);
        if (cents < 1) fail(`${name} has no valid selling price.`);
        const totalQty = (quantities.get(name) || 0) + quantity;
        const sizeKey = JSON.stringify([name,size]);
        const sizeQty = (sizeQuantities.get(sizeKey) || 0) + quantity;
        if (!Number.isFinite(Number(p.quantity)) || totalQty > Number(p.quantity)) fail(`${name} has insufficient stock.`);
        if (sizes.length && sizeQty > Number(p.sizeQuantities[size])) fail(`${name} has insufficient stock in size ${size}.`);
        quantities.set(name,totalQty); sizeQuantities.set(sizeKey,sizeQty);
        subtotal += cents * quantity;
        const image = (p.images && p.images[0]) || p.img || '';
        items.push({name,size,color,quantity,price:cents/100,...(p.isPreorder ? {isPreorder:true,launchPrice:money(p.price)/100,expectedShipDate:p.expectedShipDate} : {}),image:typeof image === 'string' && /^https:\/\//.test(image) ? image : '', translations:p.translations || {}});
    }
    const shippingInfo = {};
    for (const field of ['firstName','lastName','email','address','apt','city','zip','country','phone']) shippingInfo[field] = text((order.shippingInfo || {})[field] || '', field === 'address' ? 500 : 250);
    if (!shippingInfo.firstName || !shippingInfo.address || !shippingInfo.city || !shippingInfo.zip || !shippingInfo.country || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shippingInfo.email)) fail('Please complete your delivery address and email.');
    let promo = 0, promoKind = null;
    const code = text(order.promoCodeUsed || '',80).toUpperCase();
    if (code) {
        if (code === 'WELCOME10' && root.welcome10Eligible !== true) fail('WELCOME10 is for newsletter subscribers. Confirm your subscription using your verified account email.');
        if (/[.#$\[\]\/]/.test(code)) fail('Invalid discount code.');
        if (past.some(o => String(o.promoCodeUsed || '').toUpperCase() === code)) fail('This discount code has already been redeemed with a paid order.');
        if (ownActive.some(q=>q.promoCodeUsed === code)) fail('An earlier checkout is still reserving this code. Please try again shortly.');
        if (code.startsWith('BDAY') && code !== 'BDAY'+uid.slice(-6).toUpperCase()) fail('This birthday code belongs to another account.');
        const expiry = (store.discountCodeExpiry || {})[code];
        if (expiry && Number(expiry) <= now) fail('This discount code has expired.');
        promoKind = own(store.discountCodes,code) ? 'discountCodes' : own(store.fixedCodes,code) ? 'fixedCodes' : null;
        if (!promoKind) fail('Invalid or expired discount code.');
        const entry = store[promoKind][code];
        const value = Number(typeof entry === 'object' ? entry.value : entry);
        const maxUses = typeof entry === 'object' && entry.maxUses != null ? Number(entry.maxUses) : Infinity;
        const used = typeof entry === 'object' ? Number(entry.uses || 0) : 0;
        if (used + active.filter(q=>q.promoCodeUsed === code).length >= maxUses) fail('This discount code is fully used or reserved by another checkout.');
        if (!Number.isFinite(value) || value < 0 || (promoKind === 'discountCodes' && value > 100)) fail('Invalid discount configuration.');
        promo = promoKind === 'discountCodes' ? Math.round(subtotal*value/100) : Math.min(subtotal,money(value));
    }
    const a = store.announcement || {};
    let announcementPercent = 0;
    if (a.active && a.isPromo && Date.parse(a.promoEndDate) > now && subtotal >= money(a.promoMinAmount || 0)) {
        announcementPercent = Number(a.promoPercent);
        if (!Number.isFinite(announcementPercent) || announcementPercent < 0 || announcementPercent > 100) fail('Invalid promotional configuration.');
    }
    const vipAmount = Math.round(subtotal*vip/100), announcementAmount = Math.round(subtotal*announcementPercent/100);
    const discount = Math.min(subtotal,vipAmount+promo+announcementAmount);
    const shipping = vip ? 0 : ['it','italy','italia'].includes(shippingInfo.country.toLowerCase()) ? 500 : 1500;
    const gift = order.isGift === true ? 200 : 0;
    const amount = subtotal-discount+shipping+gift;
    if (!Number.isSafeInteger(amount) || amount < 50 || amount > 99999999) fail('This total cannot be processed through online checkout. Please contact support.');
    return {version:1,userId:uid,createdAt:now,expiresAt:Math.floor(now/1000)*1000+35*60*1000,currency:'eur',amount,items,shippingInfo,
        subtotal:subtotal/100,totalAmount:amount/100,discountAmount:discount/100,shippingCost:shipping/100,giftCost:gift/100,
        isGift:order.isGift===true,giftNote:text(order.giftNote || '',1000),vipDiscountPercent:vip,
        promoCodeUsed:code || null,promoKind,announcementDiscount:announcementAmount/100,announcementPromoPercent:announcementPercent};
}
function applyPayment(root, session, now) {
    const id = session.metadata && session.metadata.orderId;
    const q = root.checkoutQuotes && root.checkoutQuotes[id];
    const o = root.orders && root.orders[id];
    root.paymentFulfillments = root.paymentFulfillments || {};
    if (root.paymentFulfillments[id]) {
        if (root.paymentFulfillments[id].sessionId !== session.id) fail('A different payment is already recorded for this order.');
        return root;
    }
    // Historical events processed by the previous webhook must not deduct stock again.
    if (!q && o && o.stripeSessionId === session.id && o.paymentDate) return root;
    if (!q || !o || q.sessionId !== session.id || o.userId !== q.userId || session.metadata.userId !== q.userId || session.currency !== 'eur' || session.amount_total !== q.amount) fail('Payment does not match a server-verified checkout.');
    if (session.payment_status !== 'paid') fail('Payment is not yet paid.');
    const review = [];
    if (o.status !== 'Pending') review.push('Order status changed before payment was confirmed.');
    const deductions = [];
    const combined = new Map();
    for (const item of q.items) {
        const key = JSON.stringify([item.name,item.size]);
        if (combined.has(key)) combined.get(key).quantity += item.quantity;
        else combined.set(key,{...item});
    }
    const totals = new Map();
    for (const item of combined.values()) {
        try {
            const match = catalog(root.mainStore || {},item.name), p = match.product;
            const total = (totals.get(item.name) || 0)+item.quantity; totals.set(item.name,total);
            if (Number(p.quantity) < total || !Number.isFinite(Number(p.quantity))) fail('Total stock is insufficient.');
            if (p.sizeQuantities && (!own(p.sizeQuantities,item.size) || Number(p.sizeQuantities[item.size]) < item.quantity)) fail('Size stock is insufficient.');
            deductions.push({p,item});
        } catch (error) { review.push(`${item.name}: ${error.message}`); }
    }
    if (!review.length) for (const {p,item} of deductions) {
        p.quantity = Number(p.quantity)-item.quantity;
        if (p.sizeQuantities) p.sizeQuantities[item.size] = Number(p.sizeQuantities[item.size])-item.quantity;
        p.isOutOfStock = p.quantity === 0;
    }
    if (q.promoCodeUsed) {
        const codes = (root.mainStore || {})[q.promoKind] || {}, entry = codes[q.promoCodeUsed];
        if (entry && typeof entry === 'object') entry.uses = Number(entry.uses || 0)+1;
        if (/^(BDAY|REF)/.test(q.promoCodeUsed)) {
            delete codes[q.promoCodeUsed];
            if (root.mainStore.discountCodeExpiry) delete root.mainStore.discountCodeExpiry[q.promoCodeUsed];
        }
    }
    Object.assign(o,{items:q.items,totalAmount:q.totalAmount,discountAmount:q.discountAmount,shippingCost:q.shippingCost,giftCost:q.giftCost,
        vipDiscountPercent:q.vipDiscountPercent,promoCodeUsed:q.promoCodeUsed,announcementDiscount:q.announcementDiscount,
        announcementPromoPercent:q.announcementPromoPercent,paymentMethod:'Stripe',currency:'EUR',stripeSessionId:session.id,
        paymentDate:new Date(now).toISOString(),status:review.length ? 'Payment Review' : 'Paid'});
    if (review.length) o.paymentReviewReason = review.join(' ');
    root.paymentFulfillments[id] = {sessionId:session.id,completedAt:now,stockApplied:!review.length,emailState:review.length?'needs_review':'pending'};
    return root;
}
module.exports = {buildQuote,applyPayment,purchased};
