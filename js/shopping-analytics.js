/* GA4 shopping events. No Google request or analytics storage before consent.
 * Set measurementId to your own G-... ID, then deploy Hosting. */
(() => {
  'use strict';
  const measurementId = 'G-91D7EK03BK';
  const enabled = /^G-[A-Z0-9]+$/.test(measurementId);
  let loaded = false;
  const sent = new Set();
  const lastShopping = new Map();
  const allowed = () => enabled && window.SayandConsent?.allowed('analytics') === true;
  const money = n => Math.round(Number(n) * 100) / 100;
  const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  function safeLocation() {
    // Exclude query strings, hashes, checkout IDs and authentication parameters.
    return location.origin + location.pathname;
  }
  function start() {
    if (!allowed()) return false;
    window['ga-disable-' + measurementId] = false;
    if (loaded) return true;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function() { window.dataLayer.push(arguments); };
    gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    gtag('js', new Date());
    let referrer = '', paymentReferral = false;
    try { const url = new URL(document.referrer); referrer = url.origin + url.pathname; paymentReferral = ['checkout.stripe.com','hooks.stripe.com'].includes(url.hostname); } catch (_) {}
    gtag('config', measurementId, {send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, ignore_referrer: paymentReferral, page_location: safeLocation(), page_referrer: referrer});
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
    gtag('event', 'page_view', {page_location: safeLocation(), page_referrer: referrer, page_title: document.title});
    return true;
  }
  function revoke() {
    if (enabled) window['ga-disable-' + measurementId] = true;
    if (loaded) gtag('consent', 'update', {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    // Remove first-party GA cookies and our purchase deduplication records.
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)|^_gid$|^_gat/.test(name)) continue;
      const parts = location.hostname.split('.');
      const domains = ['', ...parts.map((_, i) => parts.slice(i).join('.'))];
      for (const domain of domains) document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '') + '; SameSite=Lax';
    }
    try { Object.keys(localStorage).filter(k => k.startsWith('sayand_ga_purchase_')).forEach(k => localStorage.removeItem(k)); } catch (_) {}
  }
  function item(p) {
    const quantity = Number(p.quantity ?? p.qty ?? 1);
    const price = (typeof p.price === 'number' || typeof p.price === 'string' && p.price.trim()) ? Number(p.price) : NaN;
    if (!p.name || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return null;
    return {item_id: String(p.name), item_name: String(p.name), item_brand: 'SAYAND',
      item_category: String(p.category || ''), item_variant: [p.size, p.color].filter(Boolean).join(' / '), quantity, price: money(price)};
  }
  function shopping(name, products) {
    if (!['view_item', 'add_to_cart', 'begin_checkout'].includes(name) || !allowed()) return false;
    const items = Object.values(products || {}).map(item);
    if (!items.length || items.some(p => !p) || !start()) return false;
    const signature = JSON.stringify(items);
    if (name !== 'add_to_cart' && lastShopping.get(name) === signature) return false;
    if (name !== 'add_to_cart') lastShopping.set(name, signature);
    gtag('event', name, {currency: 'EUR', value: money(items.reduce((n, p) => n + p.quantity * p.price, 0)), items});
    return true;
  }
  function purchase(id, order, uid) {
    // Only call with a canonical orders/<id> snapshot read using the signed-in user's rules.
    if (!allowed() || !/^[-A-Za-z0-9_]{20}$/.test(id || '') || !uid || order?.userId !== uid ||
        order.stripeMode !== 'live' || !order.stripeSessionId || !order.paymentDate ||
        !['Paid', 'Preparing', 'Preparing Shipment', 'Shipped', 'Delivered', 'Completed'].includes(order.status)) return false;
    const key = 'sayand_ga_purchase_' + id;
    if (sent.has(id) || read(key)) return false;
    const items = Object.values(order.items || {}).map(item);
    if (!items.length || items.some(p => !p)) return false;
    const total = money(order.totalAmount), shipping = money(order.shippingCost || 0);
    const gift = money(order.giftCost || 0), discount = money(order.discountAmount || 0);
    const gross = money(items.reduce((n, p) => n + p.quantity * p.price, 0));
    if (![total, shipping, gift, discount].every(n => Number.isFinite(n) && n >= 0) || discount > gross ||
        Math.round((gross - discount + shipping + gift) * 100) !== Math.round(total * 100)) return false;
    // Allocate order-wide discounts in integer cents. Split quantity rows if needed
    // so sum(item.price * quantity) exactly matches merchandise revenue.
    let remaining = Math.round(discount * 100), base = Math.round(gross * 100);
    const discounted = [];
    for (const p of items) {
      const unit = Math.round(p.price * 100), line = unit * p.quantity;
      const share = base ? Math.min(remaining, Math.round(remaining * line / base)) : 0;
      remaining -= share; base -= line;
      const net = line - share, low = Math.floor(net / p.quantity), extra = net % p.quantity;
      if (p.quantity > extra) discounted.push({...p, quantity: p.quantity - extra, price: low / 100, discount: (unit - low) / 100});
      if (extra) discounted.push({...p, quantity: extra, price: (low + 1) / 100, discount: (unit - low - 1) / 100});
    }
    if (gift) discounted.push({item_id: 'gift-wrapping', item_name: 'Gift wrapping', price: gift, quantity: 1});
    if (!start()) return false;
    gtag('event', 'purchase', {transaction_id: id, currency: 'EUR', value: money(total - shipping), shipping, items: discounted});
    sent.add(id);
    try { localStorage.setItem(key, '1'); } catch (_) {}
    return true;
  }
  // Analytics failure must never interrupt checkout or order confirmation.
  window.SayandAnalytics = {
    shopping(...args) {try {return shopping(...args);} catch (_) {return false;}},
    purchase(...args) {try {return purchase(...args);} catch (_) {return false;}}
  };
  window.addEventListener('sayand:consentchange', () => {
    if (allowed()) {
      if (loaded) gtag('consent', 'update', {analytics_storage: 'granted'});
      start();
    } else revoke();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
