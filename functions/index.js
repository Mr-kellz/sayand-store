const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const https = require('https');
if (!admin.apps.length) {
    admin.initializeApp();
}

const payments = require('./payment-store');
const stripeConfig = require('./stripe-config');
const {orderEmailParams} = require('./order-email');
exports.createStripeCheckout = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated','Please sign in.');
    if (process.env.CHECKOUT_RECOVERY_ENABLED !== 'true') throw new functions.https.HttpsError('unavailable','Checkout is temporarily paused.');
    const id=data && data.orderId, uid=context.auth.uid;
    if (!/^[-A-Za-z0-9_]{20}$/.test(id || '')) throw new functions.https.HttpsError('invalid-argument','Invalid order reference.');
    try {
        const settings=stripeConfig.config(), stripe=require('stripe')(settings.key), db=admin.database();
        const q=await payments.quoteOrder(db,id,uid,Date.now(),settings.mode);
        await payments.publishQuote(db,id,q);
        let session;
        if (q.sessionId) session=await stripe.checkout.sessions.retrieve(q.sessionId);
        else {
            session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],
                currency:'eur',adaptive_pricing:{enabled:false},
                line_items:[{price_data:{currency:'eur',product_data:{name:'SAYAND order #'+id.slice(-6).toUpperCase()},unit_amount:q.amount},quantity:1}],
                metadata:{orderId:id,userId:uid,pricingVersion:'2',stripeMode:settings.mode},client_reference_id:id,
                customer_email:q.shippingInfo.email,expires_at:Math.floor(q.expiresAt/1000),
                success_url:'https://thesayand.com/success.html',cancel_url:'https://thesayand.com/checkout.html'
            },{idempotencyKey:'sayand-v3-'+settings.mode+'-'+id});
            stripeConfig.assertSession(session,settings);
            await payments.recordSession(db,id,q,session);
        }
        stripeConfig.assertSession(session,settings);
        if (session.status !== 'open' || !session.url) throw new Error('This checkout is no longer open.');
        return {url:session.url,totalAmount:q.totalAmount,currency:'EUR'};
    } catch (error) {
        console.error('Checkout failed:',{orderId:id,code:error.code || 'internal',message:error.message});
        throw new functions.https.HttpsError(error.code === 'failed-precondition' ? 'failed-precondition' : 'internal',
            error.code === 'failed-precondition' ? error.message : 'Unable to prepare checkout. Please contact support.');
    }
});

const BREVO_API_KEY = process.env.BREVO_API_KEY;

const TEMPLATES = {
    signup_verification: 4,
    order_confirmed: 6,
    order_shipped: 7,
    subscriber_welcome: 3,
    abandoned_cart: 8,
    new_arrival: 12,
    promo: 11,
    return_approved: 15,
    vip_invite: 16,
    restock: 17,
    post_purchase: 18,
    account_welcome: 19,
    password_reset: 20,
    vip_unlocked: 21,
    gift_card: 22,
    birthday: 23
};

// ─── TELEGRAM BOT CONFIG (loaded from .env file) ───
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || '').split(',').filter(id => id.trim());

// ─── TELEGRAM HELPER ───
function sendTelegramMessage(chatId, text) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        });

        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload, 'utf8')
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(body || '{}'));
                } else {
                    reject(new Error(`Telegram Error ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(payload);
        req.end();
    });
}

// NATIVE HTTPS HELPER (With UTF-8 Fix for special characters)
function sendBrevoEmail(payloadData) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payloadData);
        const options = {
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(data, 'utf8')
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(responseBody || '{}'));
                } else {
                    reject(new Error(`Brevo Error ${res.statusCode}: ${responseBody}`));
                }
            });
        });

        req.setTimeout(15000, () => req.destroy(new Error('Email request timed out; delivery requires review.')));
        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

exports.sendStoreEmail = functions.https.onCall(async (data, context) => {
    if (['order_confirmed','order_shipped','return_approved'].includes(data && data.type) && (!context.auth || context.auth.uid !== 'MS15g8h5ELPmMcuBijhEC7loGws2')) {
        throw new functions.https.HttpsError('permission-denied','Only the store administrator can send order emails.');
    }
    console.log("=== SEND STORE EMAIL START ===");
    console.log("Input:", JSON.stringify(data));

    const { type, payload } = data;
    let templateId = TEMPLATES[type];

    console.log(`Type: ${type}, Template ID: ${templateId}`);

    if (!templateId) {
        console.error("Invalid template type. Available:", Object.keys(TEMPLATES));
        return { success: false, message: 'Invalid email type: ' + type };
    }

    let emails = [];
    let cleanParams = {};

    if (payload) {
        cleanParams = { ...payload };
        if (cleanParams.recipientEmails) {
            emails = Array.isArray(cleanParams.recipientEmails) ? cleanParams.recipientEmails : [cleanParams.recipientEmails];
            delete cleanParams.recipientEmails;
        } else if (cleanParams.email) {
            emails = [cleanParams.email];
            delete cleanParams.email;
        }
    }

    console.log("Emails:", emails);
    console.log("Params:", JSON.stringify(cleanParams));

    if (emails.length === 0) {
        return { success: false, message: 'No recipients provided.' };
    }

    const dynamicSubject = cleanParams.promoSubject || cleanParams.subject || null;
    delete cleanParams.promoSubject;
    delete cleanParams.subject;

    const sendBrevoEmailFn = (brevoPayload) => {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(brevoPayload);
            console.log("Brevo payload:", data);

            const options = {
                hostname: 'api.brevo.com',
                path: '/v3/smtp/email',
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(data, 'utf8')
                }
            };

            const req = https.request(options, (res) => {
                let responseBody = '';
                res.on('data', (chunk) => { responseBody += chunk; });
                res.on('end', () => {
                    console.log(`Brevo response status: ${res.statusCode}`);
                    console.log(`Brevo response body: ${responseBody}`);

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsed = JSON.parse(responseBody || '{}');
                            resolve(parsed);
                        } catch (e) {
                            resolve({ raw: responseBody });
                        }
                    } else {
                        reject(new Error(`Brevo HTTP ${res.statusCode}: ${responseBody}`));
                    }
                });
            });

            req.on('error', (e) => {
                console.error("Request error:", e);
                reject(e);
            });

            req.write(data);
            req.end();
        });
    };

    const sendWithFallback = async (userEmail) => {
        const brevoPayload = {
            sender: { name: "SAYAND", email: "noreply@thesayand.com" },
            to: [{ email: userEmail }],
            templateId: templateId,
            params: cleanParams
        };

        if (dynamicSubject) {
            brevoPayload.subject = dynamicSubject;
        }

        try {
            const result = await sendBrevoEmailFn(brevoPayload);
            return { success: true, method: 'template', result };
        } catch (templateErr) {
            console.log(`Template failed for ${userEmail}: ${templateErr.message}`);

            if (type === 'subscriber_welcome') {
                const firstName = cleanParams.firstName || cleanParams.FIRSTNAME || 'there';
                const htmlBody = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"></head>
                <body style="margin:0;padding:0;background:#f9f6f0;font-family:Arial,sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center" style="background:#f9f6f0;padding:40px 0;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
                <tr><td style="padding:30px;text-align:center;">
                <div style="font-size:18px;font-weight:bold;letter-spacing:6px;text-transform:uppercase;color:#1a2e15;">SAYAND</div>
                </td></tr>
                <tr><td><img src="https://firebasestorage.googleapis.com/v0/b/sayand-store.firebasestorage.app/o/design%2F1782236474067_IMG_5009.jpeg?alt=media&token=e1d090de-abe9-4117-a7d6-d7ea8035ef33" width="600" style="width:100%;display:block;"></td></tr>
                <tr><td style="padding:40px 30px;text-align:center;">
                <div style="font-size:11px;letter-spacing:6px;text-transform:uppercase;color:#6a7c64;margin-bottom:16px;">New / Style</div>
                <h1 style="font-size:36px;font-weight:bold;line-height:1.2;color:#1a2e15;text-transform:uppercase;margin:0;letter-spacing:2px;">Welcome to<br>the Vip Family</h1>
                </td></tr>
                <tr><td style="padding:0 40px 40px;">
                <div style="font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#6a7c64;margin-bottom:20px;">Hi ${firstName},</div>
                <p style="font-size:16px;line-height:1.8;color:#6a7c64;margin:0 0 40px;">
                Thank you for joining SAYAND. You've joined the inner circle. SAYAND is built for those who understand that style isn't worn—it's curated.
                </p>
                <div style="background:#1a2e15;padding:40px;text-align:center;">
                <div style="font-size:11px;letter-spacing:6px;text-transform:uppercase;color:#d4af37;margin-bottom:20px;">Your Welcome Gift</div>
                <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#f9f6f0;margin:20px 0;">WELCOME10</div>
                <p style="font-size:14px;color:#d4af37;margin:0 0 30px;">10% off your first order</p>
                <a href="https://thesayand.com" style="display:inline-block;padding:16px 50px;background:#d4af37;color:#1a2e15;text-decoration:none;font-size:12px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;">Shop Collection</a>
                </div>
                </td></tr>
                <tr><td style="padding:40px;text-align:center;">
                <p style="font-size:11px;color:#6a7c64;letter-spacing:2px;text-transform:uppercase;margin:0;">SAYAND © 2026</p>
                </td></tr>
                </table>
                </td></tr>
                </table>
                </body>
                </html>`;

                const fallbackPayload = {
                    sender: { name: "SAYAND", email: "noreply@thesayand.com" },
                    to: [{ email: userEmail }],
                    subject: dynamicSubject || "Welcome to SAYAND",
                    htmlContent: htmlBody
                };

                try {
                    const result = await sendBrevoEmailFn(fallbackPayload);
                    return { success: true, method: 'fallback_html', result };
                } catch (fallbackErr) {
                    return { success: false, error: fallbackErr.message };
                }
            }

            return { success: false, error: templateErr.message };
        }
    };

    const results = [];
    for (const email of emails) {
        const result = await sendWithFallback(email);
        results.push({ email, ...result });
    }

    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success);
    console.log(`=== RESULTS: ${successes}/${emails.length} succeeded ===`);
    console.log("Details:", JSON.stringify(results));

    // Build human-readable message for frontend
    let message = '';
    if (successes === emails.length) {
        message = `All ${emails.length} email(s) sent successfully.`;
    } else if (successes > 0) {
        message = `${successes}/${emails.length} sent. ${failures.length} failed.`;
    } else {
        const firstError = failures[0]?.error || 'Unknown error';
        message = `All emails failed. First error: ${firstError}`;
    }

    return {
        success: successes > 0,
        sentCount: successes,
        total: emails.length,
        message: message,
        details: results
    };
});

const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
exports.checkAbandonedCarts = functions.pubsub.schedule('every 12 hours').onRun(async (context) => {
    const usersSnap = await admin.database().ref('users').once('value');
    if (!usersSnap.exists()) return null;

    const users = usersSnap.val();
    const now = Date.now();

    for (const uid of Object.keys(users)) {
        const user = users[uid];
        if (user.cart && user.email) {

            const cartKeys = Object.keys(user.cart);
            const firstItem = user.cart[cartKeys[0]];

      // 🟢 FIX: Added '!firstItem.abandonedEmailSent' so it only runs ONCE per item
            if (firstItem.addedAt && (now - firstItem.addedAt > FIVE_DAYS) && !firstItem.abandonedEmailSent) {

                const payload = {
                    firstName: user.firstName || 'there',
                    productName: firstItem.name,
                    productPrice: firstItem.price,
                    productImage: firstItem.image,
                    cartUrl: "https://thesayand.com/checkout.html",
                    productUrl: `https://thesayand.com/product.html?item=${encodeURIComponent(firstItem.name)}`
                };

                try {
                    await sendBrevoEmail({
                        sender: { name: "SAYAND", email: "noreply@thesayand.com" },
                        to: [{ email: user.email }],
                        templateId: TEMPLATES.abandoned_cart,
                        params: payload
                    });

                    // 🟢 FIX: Tell the database we sent the email so it never loops again!
                    await admin.database().ref(`users/${uid}/cart/${cartKeys[0]}`).update({
                        abandonedEmailSent: true
                    });

                } catch (e) {
                    console.error("Error sending abandoned cart:", e.message);
                }
            }
        }
    }
    return null;
});

// ─── TELEGRAM ORDER ALERT (ONLY ON PAID) ───
exports.sendOrderAlert = functions.database.ref('/orders/{orderId}')
    .onUpdate((change, context) => {
        const beforeData = change.before.val();
        const afterData = change.after.val();

        // 🟢 FIX: Only trigger the Telegram alert if the status just changed to 'Paid'
        if (beforeData.status !== 'Paid' && afterData.status === 'Paid') {
            const customerName = afterData.shippingInfo?.firstName || "A Customer";
            const total = afterData.totalAmount || 0;
            const orderIdShort = context.params.orderId.slice(-6).toUpperCase();

            const message = `🚨 <b>SAYAND NEW PAID ORDER</b>\n\n` +
                            `📦 Order: <b>#${orderIdShort}</b>\n` +
                            `👤 Customer: <b>${customerName}</b>\n` +
                            `💶 Total: <b>€${total}</b>\n` +
                            `📧 Email: ${afterData.shippingInfo?.email || 'N/A'}\n` +
                            `📱 Phone: ${afterData.shippingInfo?.phone || 'N/A'}\n\n` +
                            `🔗 <a href="https://thesayand.com/admin.html">Open Dashboard</a>`;

            const promises = TELEGRAM_CHAT_IDS.map(chatId =>
                sendTelegramMessage(chatId, message)
                    .then(() => console.log(`✅ Telegram order alert sent to ${chatId}`))
                    .catch((err) => console.error(`❌ Failed for ${chatId}:`, err.message))
            );

            return Promise.all(promises).then(() => null);
        }
        return null; // Do nothing if it's just a regular update
    });

// ─── TELEGRAM RETURN ALERT (DUAL RECIPIENTS) ───
exports.alertOnReturnRequest = functions.database.ref('/orders/{orderId}')
    .onUpdate(async (change, context) => {
        const beforeData = change.before.val();
        const afterData = change.after.val();

        if (beforeData.status !== 'Return Requested' && afterData.status === 'Return Requested') {

            const orderIdShort = context.params.orderId.slice(-6).toUpperCase();
            const message = `🚨 <b>ATELIER ALERT</b>\n\n` +
                            `↩️ Order <b>#${orderIdShort}</b> requested a return/refund.\n\n` +
                            `🔗 <a href="https://thesayand.com/admin.html">Open Admin Panel</a>`;

            // 🟢 FIX: Removed the broken '.value().split' code so it reads the Array correctly
            const promises = TELEGRAM_CHAT_IDS.map(chatId => 
                sendTelegramMessage(chatId, message)
                    .then(() => console.log(`✅ Telegram return alert sent to ${chatId}`))
                    .catch((err) => console.error(`❌ Failed for ${chatId}:`, err.message))
            );

            await Promise.all(promises);
        }
        return null;
    });

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

exports.checkPostPurchaseCare = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const ordersSnap = await admin.database().ref('orders').once('value');
    if (!ordersSnap.exists()) return null;

    const orders = ordersSnap.val();
    const now = Date.now();

    for (const orderId of Object.keys(orders)) {
        const order = orders[orderId];

        if (order.status === 'Delivered' && order.deliveredAt && !order.careEmailSent) {
            if (now - order.deliveredAt > FOURTEEN_DAYS) {
                try {
                    await sendBrevoEmail({
                        sender: { name: "SAYAND", email: "noreply@thesayand.com" },
                        to: [{ email: order.shippingInfo.email }],
                        templateId: TEMPLATES.post_purchase,
                        params: {
                            firstName: order.shippingInfo.firstName || 'there'
                        }
                    });

                    await admin.database().ref(`orders/${orderId}`).update({
                        careEmailSent: true
                    });

                } catch (e) {
                    console.error(`Error sending Care email for order ${orderId}:`, e.message);
                }
            }
        }
    }
    return null;
});

const FIVE_MINUTES = 5 * 60 * 1000;

exports.checkDelayedWelcome = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    const usersSnap = await admin.database().ref('users').once('value');
    if (!usersSnap.exists()) return null;

    const users = usersSnap.val();
    const now = Date.now();

    for (const uid of Object.keys(users)) {
        const user = users[uid];

        if (user.createdAt && user.email && !user.welcomeEmailSent) {
            if (now - user.createdAt >= FIVE_MINUTES) {
                try {
                    await sendBrevoEmail({
                        sender: { name: "SAYAND", email: "noreply@thesayand.com" },
                        to: [{ email: user.email }],
                        templateId: TEMPLATES.account_welcome,
                        params: {
                            firstName: user.firstName || 'there'
                        }
                    });

                    await admin.database().ref(`users/${uid}`).update({
                        welcomeEmailSent: true
                    });

                } catch (e) {
                    console.error(`Error sending welcome email for user ${uid}:`, e.message);
                }
            }
        }
    }
    return null;
});

exports.requestPasswordReset = functions.https.onCall(async (data, context) => {
    const { email } = data;
    if (!email) return { success: false, message: 'Email is required.' };

    try {
        const rawLink = await admin.auth().generatePasswordResetLink(email);

        const urlObj = new URL(rawLink);
        const oobCode = urlObj.searchParams.get('oobCode');

        const customResetLink = `https://thesayand.com/reset-password.html?oobCode=${oobCode}`;

        await sendBrevoEmail({
            sender: { name: "SAYAND", email: "noreply@thesayand.com" },
            to: [{ email: email }],
            templateId: TEMPLATES.password_reset,
            params: {
                resetLink: customResetLink
            }
        });

        return { success: true };
    } catch (error) {
        console.error("Reset Error:", error);

        if (error.code === 'auth/user-not-found') {
            return { success: false, message: 'No account found with this email address.' };
        }

        return { success: false, message: 'Server error: ' + error.message };
    }
});

exports.checkBirthdays = functions.pubsub.schedule('0 9 * * *').timeZone('Europe/Rome').onRun(async (context) => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;    const currentDay = today.getDate();
    const currentYear = today.getFullYear();

    const usersSnap = await admin.database().ref('users').once('value');
    if (!usersSnap.exists()) return null;

    const users = usersSnap.val();

    for (const uid of Object.keys(users)) {
        const user = users[uid];

        if (user.dateOfBirth && user.email) {
            const [dobYear, dobMonth, dobDay] = user.dateOfBirth.split('-').map(Number);

            if (dobMonth === currentMonth && dobDay === currentDay) {
                const lastSentYear = user.birthdayEmailSentYear || 0;

                if (lastSentYear < currentYear) {
                    const birthdayCode = 'BDAY' + uid.slice(-6).toUpperCase();

                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + 14);
                    expiryDate.setHours(23, 59, 59, 999);
                    const expiryTimestamp = expiryDate.getTime();

                    try {
                        const updates = {};
                        updates[`mainStore/discountCodes/${birthdayCode}`] = 10;
                        updates[`mainStore/discountCodeExpiry/${birthdayCode}`] = expiryTimestamp;
                        await admin.database().ref().update(updates);

                        await sendBrevoEmail({
                            sender: { name: "SAYAND", email: "noreply@thesayand.com" },
                            to: [{ email: user.email }],
                            templateId: TEMPLATES.birthday,
                            params: {
                                firstName: user.firstName || 'there',
                                promoCode: birthdayCode,
                                shopUrl: "https://thesayand.com/"
                            }
                        });

                        await admin.database().ref(`users/${uid}`).update({
                            birthdayEmailSentYear: currentYear
                        });

                        console.log(`✅ Birthday email sent to ${user.email} | Code: ${birthdayCode} | Expires: ${expiryDate.toISOString()}`);
                    } catch (e) {
                        console.error(`Error sending birthday email to ${user.email}:`, e.message);
                    }
                }
            }
        }
    }
    return null;
});

// ─── AUTOMATICALLY CLEAN UP DELETED USERS ───
exports.cleanupDeletedUser = functions.auth.user().onDelete(async (user) => {
    const uid = user.uid;
    try {
        // Deletes the user's profile from the database
        await admin.database().ref(`users/${uid}`).remove();
        console.log(`✅ Successfully wiped database profile for deleted user: ${uid}`);
    } catch (error) {
        console.error(`❌ Error wiping database profile for user ${uid}:`, error.message);
    }
});
// Signed Stripe events are the only source of payment confirmation.
exports.stripeWebhook = functions.https.onRequest(async (req,res) => {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    let stripe,event,settings;
    try { settings=stripeConfig.config(); stripe=require('stripe')(settings.key); } catch (error) { return res.status(503).send('Payment configuration unavailable'); }
    try {
        event=stripe.webhooks.constructEvent(req.rawBody,req.headers['stripe-signature'],settings.webhookSecret);
    } catch (error) { return res.status(400).send('Invalid webhook signature'); }
    if (event.livemode !== settings.live) return res.status(400).send('Webhook mode mismatch');
    if (!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) return res.json({received:true});
    // Old paused sessions require separate reconciliation; never recreate deleted orders from an old event.
    if (event.data.object.metadata?.pricingVersion !== '2') {
        console.warn('Legacy Stripe event requires manual review:',{eventId:event.id});
        return res.json({received:true,legacy:true});
    }
    try {
        const session=await stripe.checkout.sessions.retrieve(event.data.object.id);
        stripeConfig.assertSession(session,settings);
        if (session.payment_status !== 'paid') return res.json({received:true});
        const db=admin.database(), result=await payments.fulfill(db,session,Date.now());
        if (await payments.claimEmail(db,result.id)) {
            const order=result.order;
            try {
                await sendBrevoEmail({sender:{name:'SAYAND',email:'noreply@thesayand.com'},
                    to:[{email:order.shippingInfo.email}],templateId:TEMPLATES.order_confirmed,
                    params:orderEmailParams(order,result.id)});
                await db.ref('paymentFulfillments/'+result.id).update({emailState:'sent',emailSentAt:Date.now()});
            } catch (error) {
                await db.ref('paymentFulfillments/'+result.id).update({emailState:'needs_review'});
                console.error('Receipt email requires manual review:',{orderId:result.id});
            }
        }
        return res.json({received:true});
    } catch (error) {
        console.error('Payment processing requires retry:',{eventId:event.id,message:error.message});
        return res.status(500).send('Payment processing requires retry');
    }
});
