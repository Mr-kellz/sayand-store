const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const https = require('https');

if (!admin.apps.length) {
    admin.initializeApp();
}

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
                <p style="font-size:11px;color:#6a7c64;letter-spacing:2px;text-transform:uppercase;margin:0;">SAYAND &copy; 2026</p>
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

// ─── TELEGRAM ORDER ALERT (DUAL RECIPIENTS) ───
exports.sendOrderAlert = functions.database.ref('/orders/{orderId}')
    .onCreate((snapshot, context) => {
        const orderData = snapshot.val();
        const customerName = orderData.shippingInfo?.firstName || "A Customer";
        const total = orderData.totalAmount || 0;
        const orderIdShort = context.params.orderId.slice(-6).toUpperCase();

        const message = `🚨 <b>SAYAND NEW ORDER</b>\n\n` +
                        `📦 Order: <b>#${orderIdShort}</b>\n` +
                        `👤 Customer: <b>${customerName}</b>\n` +
                        `💶 Total: <b>€${total}</b>\n` +
                        `📧 Email: ${orderData.shippingInfo?.email || 'N/A'}\n` +
                        `📱 Phone: ${orderData.shippingInfo?.phone || 'N/A'}\n\n` +
                        `🔗 <a href="https://thesayand.com/admin.html">Open Dashboard</a>`;

        const promises = TELEGRAM_CHAT_IDS.map(chatId =>
            sendTelegramMessage(chatId, message)
                .then(() => console.log(`✅ Telegram order alert sent to ${chatId}`))
                .catch((err) => console.error(`❌ Failed for ${chatId}:`, err.message))
        );

        return Promise.all(promises).then(() => null);
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

            const chatIds = TELEGRAM_CHAT_IDS.value().split(',').filter(id => id.trim());
            const promises = chatIds.map(chatId =>                sendTelegramMessage(chatId, message)
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