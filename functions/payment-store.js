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
// The same customer's abandoned, unpaid Stripe session must be expired at Stripe
// BEFORE its discount reservation can be released. Never reclaim another owner's
// checkout, a completed checkout, or a checkout without a recorded session.
function checkoutConflict(message) {
    const error = new Error(message);
    error.code = 'failed-precondition';
    throw error;
}
async function releaseOwnAbandonedPromo(db, stripe, id, uid, now, mode) {
    if (!/^[-A-Za-z0-9_]{20}$/.test(id || '') || !['test','live'].includes(mode)) checkoutConflict('Invalid checkout request.');
    const current = (await db.ref('orders/'+id).once('value')).val();
    if (!current || current.userId !== uid || current.status !== 'Pending') return;
    const code = typeof current.promoCodeUsed === 'string' ? current.promoCodeUsed.trim().toUpperCase() : '';
    if (!code || !/^[A-Z0-9_-]{2,80}$/.test(code)) return;
    const quotes = (await db.ref('checkoutQuotes').once('value')).val() || {};
    const previous = Object.entries(quotes).filter(([oldId,q]) =>
        oldId !== id && /^[-A-Za-z0-9_]{20}$/.test(oldId) && q &&
        q.userId === uid && q.version === 2 && q.promoCodeUsed === code &&
        (q.stripeMode || 'test') === mode && Number(q.expiresAt) > now);
    for (const [oldId,q] of previous) {
        if (!q.sessionId) checkoutConflict('Your previous checkout is still being prepared. Please try again shortly.');
        const oldOrder = (await db.ref('orders/'+oldId).once('value')).val();
        if (!oldOrder || oldOrder.userId !== uid || oldOrder.status !== 'Pending' || oldOrder.paymentDate || oldOrder.stripeSessionId)
            checkoutConflict('Your previous checkout may already be paid. Please check My Orders.');
        const session = await stripe.checkout.sessions.retrieve(q.sessionId);
        if (!session || session.id !== q.sessionId || !session.metadata ||
            session.metadata.orderId !== oldId || session.metadata.userId !== uid ||
            session.metadata.pricingVersion !== '2' || session.metadata.stripeMode !== mode ||
            session.livemode !== (mode === 'live') || session.currency !== 'eur' ||
            session.amount_total !== q.amount)
            checkoutConflict('Your previous payment session could not be verified. Contact support.');
        if (session.status === 'open' && session.payment_status === 'unpaid') {
            let expired;
            try { expired = await stripe.checkout.sessions.expire(q.sessionId); }
            catch (error) {
                // Stripe may have expired it concurrently. Never assume a failed
                // expiration means unpaid; check the actual state again.
                expired = await stripe.checkout.sessions.retrieve(q.sessionId);
            }
            if (!expired || expired.id !== q.sessionId || expired.status !== 'expired' || expired.payment_status !== 'unpaid')
                checkoutConflict('Your previous checkout is not safely closed. Please check My Orders.');
        } else if (session.status !== 'expired' || session.payment_status !== 'unpaid') {
            checkoutConflict('Your previous checkout may have been completed. Please check My Orders.');
        }
        // Conditional, narrow write. All other quote fields and order records stay intact.
        // A paid session can never be released via this path.
        await scopedTransaction(db,'checkoutQuotes/'+oldId,held => {
            if (!held || held.version !== 2 || held.userId !== uid ||
                held.promoCodeUsed !== code || held.sessionId !== q.sessionId ||
                (held.stripeMode || 'test') !== mode || held.amount !== q.amount ||
                held.expiresAt <= now) return;
            return {...held, expiresAt:now-1, abandonedAt:now};
        });
    }
}

async function quoteOrder(db, id, uid, now, mode = 'test', auth = null) {
    if (!['test','live'].includes(mode)) throw new Error('Invalid payment mode.');
    const [orderSnap,storeSnap,ordersSnap] = await Promise.all([
        db.ref('orders/'+id).once('value'), db.ref('mainStore').once('value'),
        db.ref('orders').orderByChild('userId').equalTo(uid).once('value')
    ]);
    const order = orderSnap.val(), store = storeSnap.val();
    if (!order || order.userId !== uid) throw new Error('Order not found in your account.');
    if (!store) throw new Error('Store data is unavailable.');
    if (order.status !== 'Pending') throw new Error('This order is no longer awaiting payment.');
    const welcome10Eligible = String(order.promoCodeUsed || '').trim().toUpperCase()==='WELCOME10' ? await require('./newsletter-eligibility').eligible(db,auth,uid) : false;
    if(String(order.promoCodeUsed || '').trim().toUpperCase()==='WELCOME10'&&!welcome10Eligible)checkoutConflict('WELCOME10 is for newsletter subscribers. Confirm your subscription using your verified account email.');
    const result = await scopedTransaction(db,'checkoutQuotes',quotes => {
        quotes = quotes || {};
        if (quotes[id]) {
            if(quotes[id].promoCodeUsed==='WELCOME10'&&!welcome10Eligible)checkoutConflict('Please confirm your newsletter subscription before using WELCOME10.');
            if ((quotes[id].stripeMode || 'test') !== mode || quotes[id].version !== 2 || quotes[id].userId !== uid || quotes[id].expiresAt <= now+60000) throw new Error('Please submit a new checkout.');
            return quotes;
        }
        const modeOrders=Object.fromEntries(Object.entries(ordersSnap.val() || {}).filter(([,o]) => (o.stripeMode || 'test') === mode));
        const modeQuotes=Object.fromEntries(Object.entries(quotes).filter(([,q]) => (q.stripeMode || 'test') === mode));
        const quote = buildQuote({mainStore:store,orders:modeOrders,checkoutQuotes:modeQuotes,welcome10Eligible},order,id,uid,now);
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
module.exports={scopedTransaction,releaseOwnAbandonedPromo,quoteOrder,publishQuote,recordSession,fulfill,claimEmail};
