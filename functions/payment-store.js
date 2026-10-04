'use strict';
const {createHash, randomUUID} = require('crypto');
const {buildQuote, applyPayment} = require('./checkout-security');
const clone = value => JSON.parse(JSON.stringify(value));

// Hold a value listener until the transaction completes. Never transact at '/'.
async function scopedTransaction(db, path, change) {
    if (!path || path === '/' || path.startsWith('/')) throw new Error('A named database path is required.');
    const ref = db.ref(path);
    let listener;
    await new Promise((resolve, reject) => {
        listener = ref.on('value', resolve, reject);
    });
    try {
        return await ref.transaction(value => {
            const next = change(value);
            if (next === null) throw new Error('Deletion is forbidden in payment transactions.');
            return next;
        }, undefined, false);
    } finally { ref.off('value', listener); }
}
async function quoteOrder(db, id, uid, now, mode = 'test') {
    if (!['test','live'].includes(mode)) throw new Error('Invalid payment mode.');
    const [orderSnap,storeSnap,ordersSnap] = await Promise.all([
        db.ref('orders/'+id).once('value'), db.ref('mainStore').once('value'),
        db.ref('orders').orderByChild('userId').equalTo(uid).once('value')
    ]);
    const order = orderSnap.val(), store = storeSnap.val();
    if (!order || order.userId !== uid) throw new Error('Order not found in your account.');
    if (!store) throw new Error('Store data is unavailable.');
    if (order.status !== 'Pending') throw new Error('This order is no longer awaiting payment.');
    const result = await scopedTransaction(db,'checkoutQuotes',quotes => {
        quotes = quotes || {};
        if (quotes[id]) {
            if ((quotes[id].stripeMode || 'test') !== mode || quotes[id].version !== 2 || quotes[id].userId !== uid || quotes[id].expiresAt <= now+60000) throw new Error('Please submit a new checkout.');
            return quotes;
        }
        const modeOrders=Object.fromEntries(Object.entries(ordersSnap.val() || {}).filter(([,o]) => (o.stripeMode || 'test') === mode));
        const modeQuotes=Object.fromEntries(Object.entries(quotes).filter(([,q]) => (q.stripeMode || 'test') === mode));
        const quote = buildQuote({mainStore:store,orders:modeOrders,checkoutQuotes:modeQuotes},order,id,uid,now);
        quote.stripeMode = mode;
        quote.version = 2;
        quotes[id] = quote;
        return quotes;
    });
    if (!result.committed) throw new Error('Could not prepare checkout.');
    return result.snapshot.child(id).val();
}
function pricedFields(q) {
    return {items:q.items,totalAmount:q.totalAmount,discountAmount:q.discountAmount,
        shippingCost:q.shippingCost,giftCost:q.giftCost,vipDiscountPercent:q.vipDiscountPercent,
        promoCodeUsed:q.promoCodeUsed || null,announcementDiscount:q.announcementDiscount,
        announcementPromoPercent:q.announcementPromoPercent,shippingInfo:q.shippingInfo,
        giftNote:q.giftNote,isGift:q.isGift,currency:'EUR',paymentMethod:'Stripe',stripeMode:q.stripeMode || 'test',pricingVerifiedAt:q.createdAt};
}
async function publishQuote(db,id,q) {
    const result = await scopedTransaction(db,'orders/'+id,order => {
        if (!order || order.userId !== q.userId || order.status !== 'Pending') return;
        return {...order,...pricedFields(q)};
    });
    if (!result.committed) throw new Error('Order is no longer awaiting payment.');
}
async function recordSession(db,id,q,session) {
    if (session.livemode !== ((q.stripeMode || 'test') === 'live')) throw new Error('Checkout mode mismatch.');
    const result = await scopedTransaction(db,'checkoutQuotes/'+id,current => {
        if (!current || current.version !== 2 || current.userId !== q.userId || current.amount !== q.amount || (current.stripeMode || 'test') !== (q.stripeMode || 'test')) return;
        if (current.sessionId && current.sessionId !== session.id) throw new Error('Checkout session conflict.');
        return {...current,sessionId:session.id};
    });
    if (!result.committed) throw new Error('Checkout session could not be saved.');
}
async function fulfill(db,session,now) {
    const id = session.metadata && session.metadata.orderId;
    if (!/^[-A-Za-z0-9_]{20}$/.test(id || '')) throw new Error('Invalid order reference.');
    const [qSnap,oSnap,doneSnap] = await Promise.all([db.ref('checkoutQuotes/'+id).once('value'),db.ref('orders/'+id).once('value'),db.ref('paymentFulfillments/'+id).once('value')]);
    const q=qSnap.val(), o=oSnap.val();
    if (!q || session.livemode !== ((q.stripeMode || 'test') === 'live') || q.version !== 2 || !o || q.sessionId !== session.id || o.userId !== q.userId || session.metadata.userId !== q.userId || session.currency !== 'eur' || session.amount_total !== q.amount || session.payment_status !== 'paid') throw new Error('Payment does not match this checkout.');
    const done=doneSnap.val();
    if (done) {
        if (done.sessionId !== session.id || o.stripeSessionId !== session.id) throw new Error('Recorded payment requires review.');
        return {id,order:o,record:done};
    }
    const receiptKey = createHash('sha256').update(session.id).digest('hex');
    // Stock and its retry marker commit together inside mainStore only.
    // The public marker contains no customer, order, address, or session identifiers.
    const stock = await scopedTransaction(db,'mainStore',store => {
        if (!store) return;
        if (store._paymentReceipts && store._paymentReceipts[receiptKey]) return store;
        const draft={mainStore:store,orders:{[id]:clone(o)},checkoutQuotes:{[id]:q}};
        applyPayment(draft,session,now);
        const paid=draft.orders[id], receipt=draft.paymentFulfillments[id];
        store._paymentReceipts = store._paymentReceipts || {};
        store._paymentReceipts[receiptKey] = {stockApplied:receipt.stockApplied,completedAt:now,
            review:paid.paymentReviewReason || ''};
        return store;
    });
    if (!stock.committed) throw new Error('Store unavailable; payment requires retry.');
    const receipt=stock.snapshot.child('_paymentReceipts/'+receiptKey).val();
    const updated=await scopedTransaction(db,'orders/'+id,current => {
        if (!current || current.userId !== q.userId) return;
        if (current.stripeSessionId) {
            if (current.stripeSessionId !== session.id) throw new Error('A different payment is recorded.');
            return current; // Preserve later admin/customer status changes on retries.
        }
        const review=receipt.review || (current.status !== 'Pending' ? 'Order status changed during payment confirmation.' : '');
        return {...current,...pricedFields(q),stripeSessionId:session.id,
            paymentDate:new Date(receipt.completedAt).toISOString(),
            status:review ? 'Payment Review' : 'Paid',paymentReviewReason:review};
    });
    if (!updated.committed) throw new Error('Order unavailable; payment requires review.');
    const order=updated.snapshot.val();
    const record=await scopedTransaction(db,'paymentFulfillments/'+id,existing => {
        if (existing) {
            if (existing.sessionId !== session.id) throw new Error('Fulfillment conflict.');
            return existing;
        }
        return {sessionId:session.id,completedAt:receipt.completedAt,stockApplied:receipt.stockApplied,
            emailState:order.status === 'Payment Review' ? 'needs_review' : 'pending'};
    });
    if (!record.committed) throw new Error('Fulfillment could not be recorded.');
    return {id,order,record:record.snapshot.val()};
}
async function claimEmail(db,id) {
    const claimId=randomUUID();
    const r=await scopedTransaction(db,'paymentFulfillments/'+id,record=> {
        if (!record || record.emailState !== 'pending') return;
        return {...record,emailState:'sending',emailClaim:claimId};
    });
    return r.committed && r.snapshot.val().emailClaim === claimId;
}
module.exports={scopedTransaction,quoteOrder,publishQuote,recordSession,fulfill,claimEmail};
