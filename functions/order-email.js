'use strict';

// Display-only data from the fulfilled, server-priced order.
function orderEmailParams(order, id) {
    const cents = value => {
        const n = Math.round(Number(value || 0) * 100);
        if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid receipt amount');
        return n;
    };
    const money = n => (n / 100).toFixed(2);
    const items = Object.values(order.items || {}).map(item => {
        const quantity = Number(item.quantity ?? item.qty ?? 1);
        if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Invalid receipt quantity');
        const unit = cents(item.price);
        return {name: item.name || '', image: /^https:\/\//i.test(item.image || '') ? item.image : '',
            variant: [item.size, item.color].filter(Boolean).join(' / '), quantity,
            unitPrice: money(unit), lineTotal: money(unit * quantity)};
    });
    const total = cents(order.totalAmount), discount = cents(order.discountAmount);
    const shipping = cents(order.shippingCost), gift = cents(order.giftCost);
    const gross = total + discount - shipping - gift;
    const itemSum = items.reduce((sum, item) => sum + cents(item.lineTotal), 0);
    if (!items.length || gross < 0 || gross !== itemSum) throw new Error('Receipt totals do not reconcile');
    const address = order.shippingInfo || {};
    const code = String(order.promoCodeUsed || '');
    const otherDiscount = Number(order.vipDiscountPercent || 0) > 0 || Number(order.announcementDiscount || 0) > 0;
    const discountLabel = code ? (otherDiscount ? `Discounts (includes promo ${code})` : `Promo (${code})`) : 'Discount';
    return {firstName: address.firstName || '', orderId: id.slice(-6).toUpperCase(), items,
        // Keep old single-product fields while the Brevo template is being replaced.
        productName: items[0].name, productImage: items[0].image, variant: items[0].variant,
        itemPrice: items[0].unitPrice, subtotal: money(total - shipping - gift),
        originalSubtotal: money(gross), discountAmount: money(discount), hasDiscount: discount > 0,
        discountLabel, promoCode: code, shippingCost: money(shipping), giftCost: money(gift), hasGift: gift > 0,
        totalAmount: money(total),
        shippingAddress: [address.address, address.apt, [address.zip, address.city].filter(Boolean).join(' '), address.country].filter(Boolean).join(', '),
        trackingUrl: 'https://thesayand.com/dashboard.html'};
}
module.exports = {orderEmailParams};
