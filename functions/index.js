const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// ==================== EMAIL CONFIG ====================
// Use Gmail with App Password (NOT your regular password)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'thesayand0@gmail.com',
        pass: process.env.GMAIL_PASSWORD || 'YOUR_GMAIL_APP_PASSWORD'
    }
});


// ==================== WELCOME EMAIL (Auto on subscribe) ====================
exports.sendWelcomeEmail = functions.database.ref('/subscribers/{pushId}')
    .onCreate(async (snapshot, context) => {
        const subscriber = snapshot.val();
        const email = subscriber.email;
        
        if (!email) return null;
        
        const mailOptions = {
            from: '"SAYAND" <thesayand0@gmail.com>',
            to: email,
            subject: 'Welcome to SAYAND',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                        body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
                        .header { background: #000; padding: 40px 30px; text-align: center; }
                        .header h1 { color: #fff; font-size: 32px; font-weight: 800; letter-spacing: -1px; margin: 0; }
                        .content { padding: 40px 30px; }
                        .content p { color: #666; font-size: 14px; line-height: 1.8; margin: 0 0 20px; }
                        .divider { border-top: 1px solid #eee; margin: 30px 0; }
                        .footer { background: #f9f9f9; padding: 30px; text-align: center; }
                        .footer p { color: #999; font-size: 11px; letter-spacing: 0.1em; margin: 0; }
                        .social { margin-top: 20px; }
                        .social a { display: inline-block; margin: 0 10px; color: #666; text-decoration: none; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>SAYAND</h1>
                        </div>
                        <div class="content">
                            <p style="font-size: 18px; font-weight: 600; color: #000;">Thank you for subscribing.</p>
                            <p>You'll be the first to know about new arrivals, exclusive offers, and limited drops. We believe in quality over quantity — every piece is designed to transcend seasons.</p>
                            <div class="divider"></div>
                            <p style="font-size: 12px; color: #999;">Follow us for daily inspiration.</p>
                        </div>
                        <div class="footer">
                            <p>© 2026 SAYAND. ALL RIGHTS RESERVED.</p>
                            <div class="social">
                                <a href="https://instagram.com/thesayand_">Instagram</a>
                                <a href="https://tiktok.com/@thesayand_">TikTok</a>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        
        try {
            await transporter.sendMail(mailOptions);
            await snapshot.ref.update({ 
                emailSent: true, 
                welcomeSentAt: admin.database.ServerValue.TIMESTAMP 
            });
            console.log('✅ Welcome email sent to:', email);
            return { success: true };
        } catch (error) {
            console.error('❌ Welcome email failed:', error);
            await snapshot.ref.update({ 
                emailSent: false, 
                error: error.message 
            });
            return { success: false, error: error.message };
        }
    });

// ==================== NEWSLETTER EMAIL (Auto on new product) ====================
exports.sendNewArrivalEmail = functions.database.ref('/products/{productId}')
    .onCreate(async (snapshot, context) => {
        const product = snapshot.val();
        
        // Get all subscribers
        const subscribersSnapshot = await admin.database().ref('/subscribers').once('value');
        if (!subscribersSnapshot.exists()) {
            console.log('No subscribers to notify');
            return null;
        }
        
        const subscribers = [];
        subscribersSnapshot.forEach(child => {
            const sub = child.val();
            if (sub.email && sub.emailSent !== false) {
                subscribers.push(sub.email);
            }
        });
        
        if (subscribers.length === 0) {
            console.log('No valid subscribers');
            return null;
        }
        
        const imgUrl = product.images && product.images[0] ? product.images[0] : '';
        const productUrl = `https://sayand-store.web.app/?product=${encodeURIComponent(product.name)}`;
        
        const mailOptions = {
            from: '"SAYAND" <thesayand0@gmail.com>',
            bcc: subscribers, // BCC so emails are private
            subject: `New Arrival: ${product.name}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                        body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
                        .header { background: #000; padding: 40px 30px; text-align: center; }
                        .header h1 { color: #fff; font-size: 32px; font-weight: 800; letter-spacing: -1px; margin: 0; }
                        .hero { position: relative; }
                        .hero img { width: 100%; height: 400px; object-fit: cover; display: block; }
                        .badge { position: absolute; top: 20px; left: 20px; background: #dc2626; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; padding: 6px 12px; }
                        .content { padding: 40px 30px; text-align: center; }
                        .content h2 { font-size: 24px; font-weight: 600; color: #000; margin: 0 0 10px; letter-spacing: -0.5px; }
                        .content .price { font-size: 20px; color: #dc2626; font-weight: 600; margin: 0 0 30px; }
                        .content p { color: #666; font-size: 14px; line-height: 1.8; margin: 0 0 30px; }
                        .cta { display: inline-block; background: #000; color: #fff; padding: 14px 40px; text-decoration: none; font-size: 11px; letter-spacing: 0.2em; font-weight: 600; }
                        .divider { border-top: 1px solid #eee; margin: 30px 0; }
                        .footer { background: #f9f9f9; padding: 30px; text-align: center; }
                        .footer p { color: #999; font-size: 11px; letter-spacing: 0.1em; margin: 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>SAYAND</h1>
                        </div>
                        <div class="hero">
                            <img src="${imgUrl}" alt="${product.name}">
                            <div class="badge">NEW ARRIVAL</div>
                        </div>
                        <div class="content">
                            <h2>${product.name}</h2>
                            <p class="price">$${product.price}</p>
                            <p>${product.description || 'Premium quality piece from SAYAND.'}</p>
                            <a href="${productUrl}" class="cta">SHOP NOW</a>
                        </div>
                        <div class="footer">
                            <p>© 2026 SAYAND. ALL RIGHTS RESERVED.</p>
                            <p style="margin-top:10px;font-size:10px;">You're receiving this because you subscribed to SAYAND.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        
        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ New arrival email sent to ${subscribers.length} subscribers for: ${product.name}`);
            
            // Log the send
            await admin.database().ref('/emailLogs').push({
                type: 'newArrival',
                productName: product.name,
                sentToCount: subscribers.length,
                sentAt: admin.database.ServerValue.TIMESTAMP
            });
            
            return { success: true, sentTo: subscribers.length };
        } catch (error) {
            console.error('❌ Newsletter failed:', error);
            return { success: false, error: error.message };
        }
    });

// ==================== SALE ALERT EMAIL (Auto on sale added) ====================
exports.sendSaleAlertEmail = functions.database.ref('/sales/{saleId}')
    .onCreate(async (snapshot, context) => {
        const sale = snapshot.val();
        
        const subscribersSnapshot = await admin.database().ref('/subscribers').once('value');
        if (!subscribersSnapshot.exists()) return null;
        
        const subscribers = [];
        subscribersSnapshot.forEach(child => {
            const sub = child.val();
            if (sub.email && sub.emailSent !== false) subscribers.push(sub.email);
        });
        
        if (subscribers.length === 0) return null;
        
        const mailOptions = {
            from: '"SAYAND" <thesayand0@gmail.com>',
            bcc: subscribers,
            subject: `SALE: Up to ${sale.percent || '50'}% off at SAYAND`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                        body { font-family: 'Inter', sans-serif; margin: 0; background: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background: #fff; }
                        .header { background: #dc2626; padding: 40px 30px; text-align: center; }
                        .header h1 { color: #fff; font-size: 48px; font-weight: 800; letter-spacing: -2px; margin: 0; }
                        .header p { color: #fff; font-size: 14px; letter-spacing: 0.2em; margin: 10px 0 0; }
                        .content { padding: 40px 30px; text-align: center; }
                        .content h2 { font-size: 28px; font-weight: 600; color: #000; margin: 0 0 20px; }
                        .content p { color: #666; font-size: 14px; line-height: 1.8; margin: 0 0 30px; }
                        .cta { display: inline-block; background: #dc2626; color: #fff; padding: 14px 40px; text-decoration: none; font-size: 11px; letter-spacing: 0.2em; font-weight: 600; }
                        .footer { background: #f9f9f9; padding: 30px; text-align: center; }
                        .footer p { color: #999; font-size: 11px; letter-spacing: 0.1em; margin: 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>SALE</h1>
                            <p>LIMITED TIME ONLY</p>
                        </div>
                        <div class="content">
                            <h2>${sale.name || 'Exclusive Sale'}</h2>
                            <p>Up to ${sale.percent || ''}% off selected styles. Don't miss out — limited stock available.</p>
                            <a href="https://sayand-store.web.app/" class="cta">SHOP THE SALE</a>
                        </div>
                        <div class="footer">
                            <p>© 2026 SAYAND. ALL RIGHTS RESERVED.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        
        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Sale alert sent to ${subscribers.length} subscribers`);
            return { success: true };
        } catch (error) {
            console.error('❌ Sale alert failed:', error);
            return { success: false, error: error.message };
        }
    });
