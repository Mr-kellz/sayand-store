// Optimistic store save: preserve payment receipts and reject stale inventory edits.
let storeBaseline = null;
let storeSaveInProgress = false;
function comparableStore(value) {
    const clean = JSON.parse(JSON.stringify(value || {}));
    delete clean._paymentReceipts;
    function stable(v) {
        if (Array.isArray(v)) return v.map(stable);
        if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
        return v;
    }
    return JSON.stringify(stable(clean));
}
async function saveStoreSafely() {
    if (!storeBaseline) throw new Error('Store has not loaded. Refresh before saving.');
    if (storeSaveInProgress) throw new Error('A save is already in progress.');
    storeSaveInProgress = true;
    const ref=db.ref('mainStore');
    let listener;
    try {
        const proposed=JSON.parse(JSON.stringify(database));
        delete proposed._paymentReceipts;
        await new Promise((resolve,reject)=>{ listener=ref.on('value',resolve,reject); });
        const result=await ref.transaction(current=>{
            if (!current || comparableStore(current) !== comparableStore(storeBaseline)) return;
            return {...current,...proposed};
        },undefined,false);
        if (!result.committed) throw new Error('The store changed since you opened admin. Refresh and reapply your edits to protect current stock.');
        storeBaseline=JSON.parse(JSON.stringify(result.snapshot.val()));
    } finally {
        if (listener) ref.off('value',listener);
        storeSaveInProgress=false;
    }
}

let database = { 
    lookbook: [], 
    siteContent: {}, 
    contact: { email: 'thesayand0@gmail.com', whatsapp: '+393299716798', instagram: 'https://instagram.com/thesayand_', tiktok: 'https://tiktok.com/@thesayand_', pinterest: 'https://pinterest.com/thesayand_', revolut: '', paypal: '' }, 
    newArrivals: [], 
    trending: [], 
    upcomingSales: [], 
    footer: {}, 
    discountCodes: {}, 
    fixedCodes: {}, 
    announcement: { text: '', active: false, isPromo: false, promoMinAmount: 0, promoPercent: 0, promoEndDate: '' } 
};

let editingTarget = null;
let uploadedImages = [];
let measurementRows = [];
let tempAiImageBase64 = ''; 
let stockNotifyCounts = {};

function normalizeCodeEntry(entry) {
    if (entry && typeof entry === 'object' && 'value' in entry) return entry;
    return { value: entry, maxUses: Infinity, uses: 0 };
}

function showAdminToast(message) {
    const toast = document.getElementById('admin-toast');
    const toastText = document.getElementById('admin-toast-text');
    if(toast && toastText) {
        toastText.innerText = message;
        toast.classList.remove('translate-y-24', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
        setTimeout(() => {
            toast.classList.add('translate-y-24', 'opacity-0');
            toast.classList.remove('translate-y-0', 'opacity-100');
        }, 3000);
    }
}

function escapeAdminTranslation(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

const GEMINI_API_KEY = 'YOUR_NEW_API_KEY_HERE'; 

console.log("[ADMIN] Connecting to Firebase Database...");

db.ref("mainStore").once("value").then((snapshot) => {
    if(snapshot.exists()) {
        console.log("[ADMIN] Database Snapshot Found. Loading data...");
        const data = snapshot.val();
        storeBaseline = JSON.parse(JSON.stringify(data));
        
        // Load Arrays Safely
        if(data.lookbook) database.lookbook = Array.isArray(data.lookbook) ? data.lookbook : Object.values(data.lookbook);
      if(data.siteContent) {
            database.siteContent = data.siteContent;
            // 🟢 Fix the crash: Storefront needs these to be strings, NOT objects!
            if (typeof database.siteContent.mediaDescriptions === 'object') database.siteContent.mediaDescriptions = "";
            if (typeof database.siteContent.hotspots === 'object') database.siteContent.hotspots = "";
        }
        if(data.contact) database.contact = data.contact;
        if(data.newArrivals) database.newArrivals = data.newArrivals;
        if(data.trending) database.trending = data.trending;
        if(data.upcomingSales) database.upcomingSales = data.upcomingSales;
        if(data.footer) database.footer = data.footer;
        if(data.discountCodes) database.discountCodes = data.discountCodes;
        if(data.fixedCodes) database.fixedCodes = data.fixedCodes;
        if(data.announcement) database.announcement = data.announcement;
        
        initFooterDefaults();
        renderLists();
        renderUpcomingList();
        renderPromoCodes();
        loadDesignForm();
        loadContactForm();
        
        // 🟢 RESTORED STARTUP TRIGGERS
        renderLookbookSlides();
        if (typeof loadHotspotEditor === 'function') loadHotspotEditor();

    } else {
        console.log("[ADMIN] No database snapshot found. Starting fresh.");
        initFooterDefaults();
    }
}).catch(err => console.error("[ADMIN] Firebase Load Error:", err));

db.ref("stockNotifications").on("value", (snapshot) => {
    stockNotifyCounts = {};
    if (snapshot.exists()) {
        snapshot.forEach((child) => {
            const prodId = child.key;
            const requests = child.val();
            let count = 0;
            if (requests) {
                Object.values(requests).forEach(req => {
                    if (req && typeof req === 'object' && req.uid) count++;
                });
            }
            stockNotifyCounts[prodId] = count;
        });
    }
    renderLists();
});

// Listen to the same authoritative orders that Stripe and admin actions update.
let adminOrdersRef = null;
let adminOrdersCallback = null;
firebase.auth().onAuthStateChanged((user) => {
    if (adminOrdersRef && adminOrdersCallback) {
        adminOrdersRef.off('value', adminOrdersCallback);
    }
    adminOrdersRef = null;
    adminOrdersCallback = null;
    const allowedAdmins = ['MS15g8h5ELPmMcuBijhEC7loGws2'];
    if (!user || !allowedAdmins.includes(user.uid)) {
        const container = document.getElementById('orders-list');
        if (container) container.textContent = '';
        return;
    }
    adminOrdersRef = db.ref('orders');
    adminOrdersCallback = (snapshot) => {
        if (typeof renderOrders === 'function') renderOrders(snapshot.val());
    };
    adminOrdersRef.on('value', adminOrdersCallback, (error) => {
        console.error('[ADMIN] Orders read failed:', error);
        const container = document.getElementById('orders-list');
        if (container) container.textContent = 'Unable to load orders. Please refresh and try again.';
    });
});

db.ref("users").on("value", (snapshot) => {
    const countEl = document.getElementById('user-count-display');
    if (countEl) {
        const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        countEl.innerHTML = `<span class="bg-[#d4af37] text-white px-2 py-1 rounded text-[9px] tracking-widest ml-3">${count} REGISTERED USERS</span>`;
    }
});

db.ref("uniqueVisitors").on("value", (snapshot) => {
    const visitorEl = document.getElementById('visitor-count-display');
    if (visitorEl) {
        const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        visitorEl.innerHTML = `<span class="bg-black text-[#d4af37] px-2 py-1 rounded text-[9px] tracking-widest">${count} UNIQUE VISITORS</span>`;
        visitorEl.classList.remove('hidden');
    }
});

window.generateAIDescription = async function() {
    const descBox = document.getElementById('prodDesc');
    const aiBtn = document.getElementById('aiDescBtn');
    const name = document.getElementById('prodName').value;
    const category = document.getElementById('prodCategory').value;

    if(GEMINI_API_KEY === 'YOUR_NEW_API_KEY_HERE' || !GEMINI_API_KEY.startsWith('AIza')) {
        alert("Oops! Your Gemini API key looks invalid.");
        return;
    }

    if (!tempAiImageBase64) {
        alert("Please UPLOAD an image from your device first so the AI can see it!");
        return;
    }

    try {
        aiBtn.innerText = "⏳ GENERATING...";
        aiBtn.disabled = true;

        const base64Data = tempAiImageBase64.split(',')[1];
        const promptText = `Write a short, engaging, and premium product description for an e-commerce fashion store called SAYAND. The product is named "${name}" and is in the "${category}" category. Look at the image provided and describe the style, texture, and vibe of the clothing. Keep it under 3 sentences. No hashtags.`;

        const requestBody = { contents: [{ parts: [ { text: promptText }, { inlineData: { mimeType: "image/jpeg", data: base64Data } } ] }] };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
        });
        const data = await response.json();

        if (!response.ok) return alert(`API Error: ${data.error?.message}`);

        if (data.candidates && data.candidates.length > 0) {
            descBox.value = data.candidates[0].content.parts[0].text.trim();
            showAdminToast("✨ AI DESCRIPTION GENERATED!");
        }
    } catch (error) {
        alert("Error connecting to AI.");
    } finally {
        aiBtn.innerText = "✨ AI GENERATE";
        aiBtn.disabled = false;
    }
}

window.calculateSalePercent = function() {
    const originalPrice = parseFloat(document.getElementById('saleOriginalPrice').value.replace('€', ''));
    const salePrice = parseFloat(document.getElementById('salePriceInput').value);
    const percentInput = document.getElementById('salePercentInput');
    if (originalPrice && salePrice && salePrice < originalPrice) {
        percentInput.value = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
    } else {
        percentInput.value = '';
    }
};

window.switchTab = function(tab) {
    document.querySelectorAll('[id^="section-"]').forEach(el => el.style.display = 'none');
    document.getElementById(`section-${tab}`).style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
        btn.classList.toggle('text-blue-600', btn.dataset.tab === tab && tab === 'orders');
    });
    if(tab === 'sales') { renderSalesList(); renderUpcomingList(); renderPromoCodes(); populateSaleSelect(); }
    if(tab === 'design') { loadDesignForm(); loadAnnouncementForm(); }
    if(tab === 'lookbook') { loadDesignForm(); renderLookbookSlides(); loadHotspotEditor(); }
    if(tab === 'contact') loadContactForm();
    if(tab === 'footer') loadFooterForm();
    if(tab === 'subscribers') loadSubscribers();
    if(tab === 'reviews') loadReviews();
}

window.toggleCollapsible = function(id, btn) {
    const el = document.getElementById(id);
    const icon = btn.querySelector('.collapsible-icon');
    el.classList.toggle('open');
    icon.style.transform = el.classList.contains('open') ? 'rotate(45deg)' : 'rotate(0deg)';
}

window.addSizeRow = function(size = '', qty = 0) {
    const container = document.getElementById('sizes-inputs');
    const rowId = 'size-row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.id = rowId;
    div.className = 'flex gap-2 items-center';
    div.innerHTML = `
        <input type="text" placeholder="Size (e.g. M)" value="${size}" class="size-name w-1/2 border border-gray-300 p-2 text-xs focus:outline-none focus:border-black uppercase">
        <input type="number" placeholder="Qty" value="${qty}" min="0" oninput="document.getElementById('prodOutOfStock').checked = false" class="size-qty w-1/3 border border-gray-300 p-2 text-xs focus:outline-none focus:border-black">
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="text-red-400 hover:text-red-600 text-xs font-bold px-2">&times;</button>
    `;
    container.appendChild(div);
}

window.addMeasurementRow = function(size, values) {
    const container = document.getElementById('measurements-inputs');
    const rowId = 'meas-row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.id = rowId;
    div.className = 'flex gap-2 items-start';
    div.innerHTML = `
        <input type="text" placeholder="Size (e.g. S)" value="${size || ''}" class="meas-size w-16 border border-gray-300 p-2 text-xs focus:outline-none focus:border-black uppercase flex-shrink-0">
        <input type="text" placeholder="Chest:96cm, Waist:82cm..." value="${values || ''}" class="meas-vals flex-1 border border-gray-300 p-2 text-xs focus:outline-none focus:border-black">
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="text-red-400 hover:text-red-600 text-xs font-bold px-1">&times;</button>
    `;
    container.appendChild(div);
}

function getMeasurementsFromForm() {
    const rows = document.getElementById('measurements-inputs').children;
    const measurements = {};
    for (let row of rows) {
        const size = row.querySelector('.meas-size').value.trim();
        const vals = row.querySelector('.meas-vals').value.trim();
        if (size && vals) {
            const valObj = {};
            vals.split(',').forEach(pair => {
                const parts = pair.split(':');
                if (parts.length === 2) valObj[parts[0].trim()] = parts[1].trim();
            });
            if (Object.keys(valObj).length > 0) measurements[size] = valObj;
        }
    }
    return Object.keys(measurements).length > 0 ? measurements : null;
}

function populateMeasurementInputs(measurements) {
    document.getElementById('measurements-inputs').innerHTML = '';
    if (!measurements) {
        addMeasurementRow('S', 'Chest:96cm, Waist:82cm, Length:70cm');
        addMeasurementRow('M', 'Chest:100cm, Waist:86cm, Length:72cm');
        return;
    }
    Object.entries(measurements).forEach(([size, vals]) => {
        const valStr = Object.entries(vals).map(([k, v]) => `${k}:${v}`).join(', ');
        addMeasurementRow(size, valStr);
    });
}

document.getElementById('prodImageFile').addEventListener('change', async function(e) {
    uploadedImages = [];
    tempAiImageBase64 = ''; 
    const files = Array.from(e.target.files);
    if(files.length === 0) return;
    
    const reader = new FileReader();
    reader.onload = (e) => { tempAiImageBase64 = e.target.result; };
    reader.readAsDataURL(files[0]);

    const preview = document.getElementById('uploaded-preview');
    preview.innerHTML = '<p class="text-[10px] text-gray-500 font-bold mt-2">Uploading high-res to cloud...</p>';
    
    try {
        for (const file of files) {
            const fileName = `products/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const storageRef = firebase.storage().ref().child(fileName);
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            uploadedImages.push(downloadURL);
            
            if(preview.innerHTML.includes('Uploading')) preview.innerHTML = '';
            const thumb = document.createElement('div');
            thumb.className = 'w-12 h-16 border border-gray-200 overflow-hidden flex-shrink-0';
            thumb.innerHTML = `<img src="${downloadURL}" class="w-full h-full object-cover">`;
            preview.appendChild(thumb);
        }
        document.getElementById('prodImgUrl').value = '';
        showAdminToast("IMAGES UPLOADED TO CLOUD!");
    } catch (error) {
        alert("Error uploading image: " + error.message);
        preview.innerHTML = '';
    }
});

document.getElementById('prodImgUrl').addEventListener('input', function() {
    if(this.value.length > 0) {
        document.getElementById('prodImageFile').value = '';
        uploadedImages = [];
        tempAiImageBase64 = '';
        document.getElementById('uploaded-preview').innerHTML = '';
    }
});

function updateDesignPreviews() {
const fields = ['heroImg', 'womenImg', 'menImg', 'accImg', 'editImg', 'lbHeroImg', 'lbWomenImg', 'lbMenImg', 'lbAccImg', 'lbSaleImg', 'lbEditCardImg'];    fields.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.value;
        const container = document.getElementById(id + 'PreviewContainer');
        if (container) {
            const firstUrl = val.split(',')[0].trim();
            if (firstUrl && !firstUrl.includes('Uploading')) {
                container.classList.remove('hidden');
                if (firstUrl.toLowerCase().match(/\.(mp4|mov|webm)(\?.*)?$/)) {
                    container.innerHTML = `<video class="w-full max-w-sm h-auto border border-gray-200 shadow-sm" src="${firstUrl}" autoplay loop muted playsinline></video>`;
                } else {
                    container.innerHTML = `<img class="w-full max-w-sm h-auto border border-gray-200 shadow-sm object-cover" src="${firstUrl}">`;
                }
            } else {
                container.classList.add('hidden');
                container.innerHTML = '';
            }
        }
    });
}

window.handleDesignImageUpload = async function(e, targetId) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    try {
        document.getElementById(targetId).value = "Uploading to cloud...";
        const urls = [];
        for (const file of files) {
            const fileName = `design/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const storageRef = firebase.storage().ref().child(fileName);
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            urls.push(downloadURL);
        }
        document.getElementById(targetId).value = urls.join(', ');
        updateDesign();
        showAdminToast("DESIGN IMAGES UPLOADED!");
    } catch (error) {
        alert("Error uploading image: " + error.message);
        document.getElementById(targetId).value = "";
    }
}

window.updateOrderTracking = async function(id) {
    const trackingVal = document.getElementById('track-' + id).value.trim();
    if (!trackingVal) return alert("Please enter a tracking code first.");

    try {
        if (typeof showAdminToast === 'function') showAdminToast("SAVING & EMAILING...");
        await db.ref('orders/' + id).update({ tracking: trackingVal, status: 'Shipped' });
        const snapshot = await db.ref('orders/' + id).once('value');
        const orderData = snapshot.val();

        if (orderData && orderData.shippingInfo && orderData.shippingInfo.email) {
            let carrierName = "Premium Carrier";
            if (trackingVal.toUpperCase().startsWith("1Z")) carrierName = "UPS";
            else if (trackingVal.length === 12 || trackingVal.length === 15) carrierName = "FedEx";
            else if (trackingVal.length === 10) carrierName = "DHL";

            const trackingLink = `https://www.17track.net/en/track?nums=${trackingVal}`;
            const sendEmailFn = firebase.functions().httpsCallable('sendStoreEmail');
            await sendEmailFn({
                type: 'order_shipped',
                payload: {
                    email: orderData.shippingInfo.email,
                    firstName: orderData.shippingInfo.firstName || 'there',
                    orderId: id.slice(-6).toUpperCase(),
                    trackingNumber: trackingVal,
                    carrier: carrierName,
                    trackingUrl: trackingLink,
                    estimatedDelivery: ['it','ita','italy','italia','italie','italien'].includes(String(orderData.shippingInfo.country || '').trim().toLowerCase()) ? "3–7 working days within Italy" : "5–14 working days internationally"
                }
            });
        }
        if (typeof showAdminToast === 'function') showAdminToast("TRACKING SAVED & EMAIL SENT!");
    } catch (error) {
        alert("Error updating tracking: " + error.message);
    }
}

const returnUploadBusy = new Set();
const returnSendBusy = new Set();

function returnLabelURL(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
}

window.uploadReturnFile = async function(orderId, input) {
    const file = input.files && input.files[0];
    if (!file || returnUploadBusy.has(orderId) || returnSendBusy.has(orderId)) return;
    const types = {'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'};
    if (!types[file.type] || file.size <= 0 || file.size > 5 * 1024 * 1024) {
        alert('Choose a PNG, JPG or PDF file up to 5 MB.');
        input.value = '';
        return;
    }
    const status = document.getElementById('qr-status-' + orderId);
    const button = document.getElementById('qr-send-' + orderId);
    returnUploadBusy.add(orderId);
    input.disabled = true;
    if (button) button.disabled = true;
    status.textContent = 'Uploading courier file...';
    try {
        const key = db.ref('orders').push().key;
        const path = 'return-labels/' + encodeURIComponent(orderId) + '/' + key + '.' + types[file.type];
        const result = await firebase.storage().ref().child(path).put(file, {contentType:file.type});
        const url = await result.ref.getDownloadURL();
        document.getElementById('qr-input-' + orderId).value = url;
        status.textContent = 'Uploaded. Preview the file, then approve and send.';
        const preview = document.createElement('a');
        preview.href = url; preview.target = '_blank'; preview.rel = 'noopener noreferrer';
        preview.textContent = ' Open uploaded file'; preview.className = 'underline font-bold';
        status.appendChild(preview);
    } catch (error) {
        status.textContent = 'Upload failed: ' + error.message;
    } finally {
        returnUploadBusy.delete(orderId);
        input.disabled = false;
        if (button) button.disabled = false;
    }
};

window.issueReturnCode = async function(orderId) {
    if (returnUploadBusy.has(orderId) || returnSendBusy.has(orderId)) return;
    const url = returnLabelURL(document.getElementById('qr-input-' + orderId).value.trim());
    if (!url) return alert('Upload the courier file or paste a valid HTTPS label link first.');
    if (!confirm('Approve this return and email this courier QR code / label to the customer? This does not buy postage or book a collection.')) return;
    returnSendBusy.add(orderId);
    let approved = false;
    try {
        const snapshot = await db.ref('orders/' + orderId).once('value');
        const order = snapshot.val();
        if (!order || !['Return Requested', 'Return Approved'].includes(order.status)) throw new Error('This order does not have an active return request.');
        if (!order.shippingInfo || !order.shippingInfo.email) throw new Error('The order has no customer email address.');
        const approvalUpdate={status:'Return Approved',returnQrUrl:url};
        if(order.returnCase){approvalUpdate['returnCase/status']='Approved';approvalUpdate['returnCase/updatedAt']=Date.now();}
        await db.ref('orders/' + orderId).update(approvalUpdate);
        approved = true;
        const result = await firebase.functions().httpsCallable('sendStoreEmail')({
            type:'return_approved',
            payload:{email:order.shippingInfo.email,firstName:order.shippingInfo.firstName || 'there',orderId:orderId.slice(-6).toUpperCase(),qrUrl:url}
        });
        if (!result.data || result.data.success !== true) throw new Error((result.data && result.data.message) || 'The email service did not confirm sending.');
        showAdminToast('RETURN APPROVED — EMAIL ACCEPTED FOR SENDING!');
    } catch (error) {
        alert((approved ? 'The return is approved and its file is available in the customer account, but the email was not confirmed. Use RESEND RETURN EMAIL to try again. ' : 'Return not approved. ') + error.message);
    } finally {
        returnSendBusy.delete(orderId);
    }
};

// ─── SEND VIP ATELIER INVITATION ───
window.inviteToAtelier = async function(email, firstName) {
    if(!confirm(`Send an exclusive VIP Atelier invitation to ${email}?`)) return;
    
    try {
        if (typeof showAdminToast === 'function') showAdminToast("SENDING INVITATION...");
        const sendEmailFn = firebase.functions().httpsCallable('sendStoreEmail');
        await sendEmailFn({
            type: 'vip_invite', 
            payload: {
                recipientEmails: [email],
                firstName: firstName || 'there',
                shopUrl: "https://thesayand.com/"
            }
        });
        showAdminToast("VIP INVITATION SENT!");
    } catch (err) {
        alert("Error sending VIP invite: " + err.message);
    }
};

// ─── SEND RESTOCK NOTIFICATIONS (SUBSCRIBERS + WAITLIST) ───
window.notifyRestock = async function(productName) {
    const safeProdId = productName.replace(/[^a-zA-Z0-9]/g, '_');
    if(!confirm(`Send "Back in Stock" emails to ALL subscribers AND waitlist members for "${productName}"?`)) return;
    
    // 1. Find the product's image and price from the database memory
    let foundProduct = null;
    const allProducts = [...(database.newArrivals || []), ...(database.trending || [])];
    foundProduct = allProducts.find(p => p.name === productName);
    
    const productPrice = foundProduct ? (foundProduct.salePrice || foundProduct.price) : ''; 
    const productImage = foundProduct ? (foundProduct.images && foundProduct.images[0] ? foundProduct.images[0] : foundProduct.img) : '';

    try {
        if (typeof showAdminToast === 'function') showAdminToast("FETCHING SUBSCRIBERS & WAITLIST...");
        
        const emails = [];
        
        // 2. Fetch General Subscribers First
        const subSnap = await db.ref("subscribers").once("value");
        if (subSnap.exists()) {
            subSnap.forEach((child) => {
                const sub = child.val();
                if (sub.email && !emails.includes(sub.email)) {
                    emails.push(sub.email);
                }
            });
        }
        
        // 3. Fetch Specific Waitlist (stockNotifications)
        const waitlistSnap = await db.ref(`stockNotifications/${safeProdId}`).once('value');
        if(waitlistSnap.exists()) {
            const requests = waitlistSnap.val();
            Object.values(requests).forEach(req => {
                if(req.email && !emails.includes(req.email)) {
                    emails.push(req.email);
                }
            });
        }
        
        if(emails.length === 0) {
            return alert("No subscribers or waitlist members found to email.");
        }
        
        if (typeof showAdminToast === 'function') showAdminToast(`EMAILING ${emails.length} USERS...`);
        
        // 4. Trigger Brevo Email via Cloud Function (Now passing ALL template variables)
        const sendEmailFn = firebase.functions().httpsCallable('sendStoreEmail');
        await sendEmailFn({
            type: 'restock', 
            payload: {
                recipientEmails: emails,
                productName: productName,
                productPrice: productPrice,
                productImage: productImage,
                productUrl: `https://thesayand.com/product.html?item=${encodeURIComponent(productName)}`
            }
        });
        
        // 5. Wipe ONLY the specific waitlist clean
        await db.ref(`stockNotifications/${safeProdId}`).remove();
        
        showAdminToast(`RESTOCK ALERTS SENT TO ${emails.length} USERS!`);
        
    } catch (err) {
        alert("Error sending restock alerts: " + err.message);
    }
};

// Orders may contain legacy string-valued prices. Keep one record from breaking the list.
function orderMoney(value, fallback=0) {
    const number=Number(value === undefined || value === null || value === '' ? fallback : value);
    return Number.isFinite(number) ? number : fallback;
}
function renderAdminReturnConversation(order) {
    const c=order.returnCase;
    if(!c || typeof c!=='object') return '';
    const messages=Object.values(c.messages || {}).filter(m=>m && typeof m.text==='string')
        .sort((a,b)=>orderMoney(a.createdAt)-orderMoney(b.createdAt));
    const latest=messages[messages.length-1];
    const isClosed=!!c.closedAt || ['Approved','Declined','Refunded','Closed'].includes(c.status);
    const needsReply=!isClosed && latest && latest.role==='customer';
    const body=messages.map(m=>`<div class="border-t border-purple-100 py-2"><strong>${m.role==='customer'?'Customer':'SAYAND'}:</strong><p class="whitespace-pre-wrap break-words">${escapeAdminTranslation(m.text)}</p></div>`).join('');
    return `<section class="mt-4 p-4 bg-purple-50 border border-purple-300" aria-label="Return request and messages">
        <div class="flex justify-between gap-2"><h5 class="font-bold text-xs">RETURN REQUEST & MESSAGES</h5>${needsReply?'<span class="text-xs font-bold text-purple-800">CUSTOMER AWAITING REPLY</span>':''}</div>
        <p class="text-xs mt-2">Status: ${escapeAdminTranslation(c.status || 'Under review')}</p>
        <p class="text-xs">Reason: ${escapeAdminTranslation(c.reason || 'Not provided')} · Condition: ${escapeAdminTranslation(c.condition || 'Not provided')}</p>
        <details class="text-xs mt-3"><summary style="cursor:pointer;font-weight:bold;color:#1a2e15">View conversation (${messages.length} messages)</summary><div style="max-height:16rem;overflow-y:auto;margin-top:12px">${body || '<p>No messages recorded for this request.</p>'}</div></details>
        <button type="button" onclick="openReturnConversation('${order.id}')" class="w-full p-3 text-xs font-bold mt-3" style="background:#1a2e15;color:#f9f6f0;border:1px solid #c7a443;border-radius:8px">${isClosed?'VIEW CLOSED RETURN':'REPLY TO CUSTOMER / REVIEW RETURN'}</button>
    </section>`;
}

window.renderOrders = function(data) {
    const container = document.getElementById('orders-list');
    if(!container) return;
    if(!data) {
        container.innerHTML = '<p class="text-[10px] text-gray-400 italic text-center py-10">No orders yet.</p>';
        return;
    }
    
    const ordersArray = Object.keys(data).filter(key => /^[-A-Za-z0-9_]{20}$/.test(key)).map(key => ({ ...data[key], id: key }));
    ordersArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    container.innerHTML = ordersArray.map(order => {
        if(order.status!=='Refunded'&&['Approved','Declined'].includes(order.returnCase?.status))order={...order,status:'Return '+order.returnCase.status};
        const date = new Date(order.timestamp || order.date).toLocaleString();
        let subtotal = 0;
        const itemsList = Object.values(order.items || {}).map(item => {
            const lineTotal = orderMoney(item.price) * orderMoney(item.quantity);
            subtotal += lineTotal;
            return `<li>${escapeAdminTranslation(item.quantity)}x ${escapeAdminTranslation(item.name)} (${escapeAdminTranslation(item.size)}/${escapeAdminTranslation(item.color)}) - €${lineTotal.toFixed(2)}</li>`
        }).join('');
        
        let statusColor = order.status === 'Pending' ? 'text-orange-500' : 
                          order.status === 'Shipped' ? 'text-blue-600' : 
                          order.status === 'Delivered' ? 'text-green-500' : 
                          order.status === 'Return Requested' ? 'text-purple-600' : 
                          order.status === 'Return Approved' ? 'text-purple-700' : 
                          order.status === 'Canceled (By User)' ? 'text-red-600' : 'text-gray-500'; 
        
        let discountHTML = '';
        if (orderMoney(order.discountAmount)) {
            let label = order.promoCodeUsed ? `PROMO (${order.promoCodeUsed})` : 'VIP DISCOUNT';
            discountHTML = `<div class="flex justify-between text-[#d4af37] font-bold text-[9px] mb-1"><span>${escapeAdminTranslation(label)}</span> <span>-€${orderMoney(order.discountAmount).toFixed(2)}</span></div>`;
        }

        let giftHTML = order.isGift ? `<div class="mt-4 mb-4 bg-[#fdfbf7] border border-[#d4af37] p-4 shadow-sm"><p class="text-[10px] font-black text-[#d4af37] tracking-[0.2em] mb-2 uppercase">🎁 Signature Gift Box Requested</p><p class="text-[12px] font-serif italic text-gray-800 border-l-2 border-[#d4af37] pl-3">" ${escapeAdminTranslation(order.giftNote || 'No custom note provided.')} "</p></div>` : '';
        let shipCostDisplay = orderMoney(order.shippingCost,15) === 0 ? "COMPLIMENTARY" : `€${orderMoney(order.shippingCost,15).toFixed(2)}`;
        
        let returnAdminAction = '';
        if (order.status === 'Return Requested' || order.status === 'Return Approved') {
            const safeReturnURL = escapeAdminTranslation(returnLabelURL(order.returnQrUrl || ''));
            returnAdminAction = `<div class="mt-4 p-4 bg-purple-50 border border-purple-200 rounded shadow-sm">
                <p class="text-[10px] font-bold text-purple-700 mb-2">COURIER RETURN QR / LABEL</p>
                <p class="text-xs mb-3">Buy the return shipment from the courier first. Upload its original PNG, JPG or PDF (maximum 5 MB). Uploading does not book a pickup.</p>
                <label for="qr-file-${order.id}" class="block text-xs font-bold mb-1">Upload courier file</label>
                <input id="qr-file-${order.id}" type="file" accept="image/png,image/jpeg,application/pdf" onchange="uploadReturnFile('${order.id}', this)" class="w-full text-xs mb-3">
                <p id="qr-status-${order.id}" role="status" aria-live="polite" class="text-xs mb-3"></p>
                <label for="qr-input-${order.id}" class="block text-xs mb-1">Or paste the courier's HTTPS file link</label>
                <input type="url" id="qr-input-${order.id}" value="${safeReturnURL}" placeholder="https://..." class="w-full border border-purple-300 p-2 text-xs mb-3 bg-white">
                ${safeReturnURL ? `<a href="${safeReturnURL}" target="_blank" rel="noopener noreferrer" class="block underline text-xs mb-3">View current return file</a>` : ''}
                <button id="qr-send-${order.id}" onclick="issueReturnCode('${order.id}')" class="w-full bg-purple-600 text-white px-4 py-3 text-[10px] font-bold">${order.status === 'Return Approved' ? 'RESEND RETURN EMAIL / SAVE NEW FILE' : 'APPROVE RETURN & SEND QR / LABEL'}</button>
            </div>`;
        } else if (order.returnQrUrl) {
            returnAdminAction = `<div class="mt-4 p-3 bg-gray-50 border border-gray-200 rounded"><p class="text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-1">RETURN QR / LABEL ISSUED</p><p class="text-[10px] text-gray-600 truncate"><a href="${escapeAdminTranslation(returnLabelURL(order.returnQrUrl))}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline font-bold hover:text-black">View Active Return Label</a></p></div>`;
        }
        
        if (order.status === 'Canceled (By User)') {
            returnAdminAction += `<div class="mt-4 p-3 bg-red-50 border border-red-200 rounded shadow-sm"><p class="text-[10px] font-bold text-red-700 tracking-widest uppercase mb-1">🚨 CANCELED BY CUSTOMER</p><p class="text-[10px] text-red-600">The customer manually canceled this order from their dashboard.</p></div>`;
        }

        return `
            <div class="order-card border border-gray-200 p-4 bg-white mb-4 shadow-sm relative">
                <div class="flex justify-between items-start border-b border-gray-100 pb-3 mb-3">
                    <div>
                        <h4 class="text-xs font-bold tracking-wider">ORDER #${order.id.slice(-6).toUpperCase()}</h4>
                        <p class="text-[9px] text-gray-400 mt-1">${date}</p>
                    </div>
                    <div class="flex gap-2 items-center">
                        <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-[10px] border border-gray-300 p-1 font-bold ${statusColor} bg-transparent outline-none max-w-[140px]">
                            <option value="Pending" ${order.status==='Pending'?'selected':''} class="text-black">Pending</option>
                            <option value="Paid" ${order.status==='Paid'?'selected':''} class="text-black">Paid</option>
                            <option value="Payment Review" ${order.status==='Payment Review'?'selected':''} class="text-black">Payment Received — Review Required</option>
                            <option value="Verifying" ${order.status==='Verifying'?'selected':''} class="text-black">Verifying Payment</option>
                            <option value="Processing" ${order.status==='Processing'?'selected':''} class="text-black">Preparing Shipment</option>
                            <option value="Shipped" ${order.status==='Shipped'?'selected':''} class="text-black">Shipped</option>
                            <option value="Delivered" ${order.status==='Delivered'?'selected':''} class="text-black">Delivered</option>
                            <option value="Return Requested" ${order.status==='Return Requested'?'selected':''} class="text-black">Return Requested</option>
                            <option value="Return Approved" ${order.status==='Return Approved'?'selected':''} class="text-black">Return Approved</option>
                            <option value="Return Declined" ${order.status==='Return Declined'?'selected':''} disabled class="text-black">Return Declined</option>
                            <option value="Refunded" ${order.status==='Refunded'?'selected':''} class="text-black">Refunded</option>
                            <option value="Canceled" ${order.status==='Canceled'?'selected':''} class="text-black">Canceled (By Admin)</option>
                            <option value="Canceled (By User)" ${order.status==='Canceled (By User)'?'selected':''} class="text-black">Canceled (By User)</option>
                        </select>
                        <button onclick="deleteOrder('${order.id}')" class="text-red-500 hover:text-red-700 font-bold text-[10px] px-2 py-1 border border-red-200 hover:bg-red-50 transition-colors">&times; DEL</button>
                    </div>
                </div>
                
                ${order.paymentReviewReason ? `<p class="text-xs text-red-700 font-bold mb-3">Payment review: ${escapeAdminTranslation(order.paymentReviewReason)} Stock was not deducted. Check Stripe and inventory before fulfilling or refunding this order.</p>` : ''}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px] mb-4">
                    <div>
                        <p class="font-bold text-gray-400 mb-2 tracking-widest border-b border-gray-50 pb-1">CUSTOMER INFO</p>
                        <p class="font-semibold text-black">${escapeAdminTranslation(order.shippingInfo?.firstName || '')} ${escapeAdminTranslation(order.shippingInfo?.lastName || '')}</p>
                        <p class="text-gray-600 flex items-center gap-2">
                            ${escapeAdminTranslation(order.shippingInfo?.email || '')} 
                            <button data-email="${escapeAdminTranslation(order.shippingInfo?.email || '')}" data-first-name="${escapeAdminTranslation(order.shippingInfo?.firstName || '')}" onclick="inviteToAtelier(this.dataset.email, this.dataset.firstName)" class="text-[#d4af37] border border-[#d4af37] px-1 py-0.5 hover:bg-[#f9f6ea] transition-colors text-[8px] font-bold">VIP INVITE</button>
                        </p>
                        <p class="text-gray-600">${escapeAdminTranslation(order.shippingInfo?.phone || '')}</p>
                    </div>
                    <div>
                        <p class="font-bold text-gray-400 mb-2 tracking-widest border-b border-gray-50 pb-1">SHIPPING ADDRESS</p>
                        <p class="text-gray-600">${escapeAdminTranslation(order.shippingInfo?.address || '')} ${escapeAdminTranslation(order.shippingInfo?.apt || '')}</p>
                        <p class="text-gray-600">${escapeAdminTranslation(order.shippingInfo?.city || '')}, ${escapeAdminTranslation(order.shippingInfo?.zip || '')}</p>
                        <p class="text-gray-600">${escapeAdminTranslation(order.shippingInfo?.country || '')}</p>
                    </div>
                </div>
                ${giftHTML}
                <div class="bg-gray-50 p-3 border border-gray-100 rounded-sm">
                    <p class="font-bold text-gray-400 mb-2 text-[10px] tracking-widest">ORDER ITEMS</p>
                    <ul class="text-[10px] space-y-1 text-black font-medium mb-3 border-b border-gray-200 pb-2">${itemsList}</ul>
                    
                    <div class="w-full flex justify-end mb-2 mt-2">
                        <div class="w-full md:w-1/2 text-[9px] text-gray-500 space-y-1">
                            <div class="flex justify-between"><span>SUBTOTAL</span> <span>€${subtotal.toFixed(2)}</span></div>
                            ${discountHTML}
                            ${order.isGift ? `<div class="flex justify-between text-black font-bold"><span>GIFT PACKAGING</span> <span>+€${orderMoney(order.giftCost,2).toFixed(2)}</span></div>` : ''}
                            <div class="flex justify-between"><span>SHIPPING</span> <span>${shipCostDisplay}</span></div>
                        </div>
                    </div>
                    <div class="flex justify-between items-center text-xs font-black border-t border-b border-gray-200 py-2 mb-3">
                        <span class="text-gray-500 text-[10px]">PAID VIA: <span class="text-blue-600 uppercase">${escapeAdminTranslation(order.paymentMethod)}</span></span>
                        <span>€${orderMoney(order.totalAmount).toFixed(2)} EUR</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[9px] font-bold text-gray-400 tracking-widest uppercase">SHIPPING & TRACKING CODE</label>
                        <div class="flex gap-2">
                            <input type="text" id="track-${order.id}" value="${escapeAdminTranslation(order.tracking || '')}" placeholder="e.g. DHL 123456789" class="flex-1 border border-gray-300 p-1.5 text-[10px] focus:border-black outline-none bg-white font-mono">
                            <button onclick="updateOrderTracking('${order.id}')" class="bg-black text-white px-3 py-1.5 text-[9px] font-bold tracking-wider hover:bg-gray-800 transition-colors">SAVE TRACKING</button>
                        </div>
                    </div>
                </div>
                ${renderAdminReturnConversation(order)}
                ${returnAdminAction}
            </div>
        `;
    }).join('');
}

window.updateOrderStatus = function(id, status) {
    db.ref('orders/' + id).transaction(order => {
        if (!order) return;
        const updates = { ...order, status: status };
        if (status === 'Delivered' && !order.deliveredAt) updates.deliveredAt = firebase.database.ServerValue.TIMESTAMP;
        return updates;
    })
    .then(() => { if (typeof showAdminToast === 'function') showAdminToast("ORDER STATUS SAVED"); })
    .catch(e => alert("Error updating order: " + e.message));
}

window.deleteOrder = function(id) {
    if(confirm("Permanently delete this order from the system?")) {
        db.ref('orders/' + id).remove()
        .then(() => showAdminToast("ORDER DELETED"))
        .catch(e => alert("Error deleting order: " + e.message));
    }
}

document.getElementById('addProductForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const section = document.getElementById('prodSection').value;
    const category = document.getElementById('prodCategory').value;
    const name = document.getElementById('prodName').value.toUpperCase();
    const price = parseFloat(document.getElementById('prodPrice').value);
    const description = document.getElementById('prodDesc').value;
    const isOutOfStock = document.getElementById('prodOutOfStock').checked;
    const isVipOnly = document.getElementById('prodVipOnly').checked; 
    
    const rawColors = document.getElementById('prodColors').value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    
    let totalQty = 0;
    const sizeQuantities = {};
    const rawSizes = [];
    const sizeRows = document.getElementById('sizes-inputs').children;
    for (let row of sizeRows) {
        const sizeName = row.querySelector('.size-name').value.trim().toUpperCase();
        const sizeQty = parseInt(row.querySelector('.size-qty').value) || 0;
        if (sizeName) {
            if(!rawSizes.includes(sizeName)) rawSizes.push(sizeName);
            sizeQuantities[sizeName] = sizeQty;
            totalQty += sizeQty;
        }
    }
    if (rawSizes.length === 0) {
        rawSizes.push('OS');
        sizeQuantities['OS'] = totalQty;
    }

    const urlInput = document.getElementById('prodImgUrl').value;
    let finalImages = [];

    if (urlInput.trim().length > 0) {
        finalImages = urlInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else if (uploadedImages.length > 0) {
        finalImages = [...uploadedImages];
    } else if (editingTarget) {
        let existingItem = database[editingTarget.section][editingTarget.index];
        finalImages = existingItem.images ? existingItem.images : [existingItem.img];
    }
    if (finalImages.length === 0) return alert("Please upload or paste at least one image.");

    const details = {};
    const mat = document.getElementById('detailMaterial').value.trim();
    const fit = document.getElementById('detailFit').value.trim();
    const care = document.getElementById('detailCare').value.trim();
    const origin = document.getElementById('detailOrigin').value.trim();
    if (mat) details.Material = mat;
    if (fit) details.Fit = fit;
    if (care) details.Care = care;
    if (origin) details.Origin = origin;

    const measurements = getMeasurementsFromForm();
    const relatedRaw = document.getElementById('prodRelated').value.trim();
    const related = relatedRaw ? relatedRaw.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0) : [];

    const newItem = { 
        name, price, description, isOutOfStock, isVipOnly,
        quantity: totalQty, 
        images: finalImages, 
        category,
        sizes: rawSizes,
        sizeQuantities: sizeQuantities,
        colors: rawColors.length > 0 ? rawColors : ['Default']
    };
    const previousItem = editingTarget ? database[editingTarget.section][editingTarget.index] : null;
    const translations = { ...(previousItem && previousItem.translations || {}) };
    for (const [code, suffix] of [['it','It'],['fr','Fr'],['de','De']]) {
        const previous = translations[code] || {};
        translations[code] = { ...previous,
            name: document.getElementById('prodName' + suffix).value.trim(),
            description: document.getElementById('prodDesc' + suffix).value.trim(),
            details: { ...(previous.details || {}) }
        };
        for (const key of ['Material','Fit','Care','Origin']) {
            translations[code].details[key] = document.getElementById('detail' + key + suffix).value.trim();
        }
    }
    newItem.translations = translations;
    if (Object.keys(details).length > 0) newItem.details = details;
    if (measurements) newItem.measurements = measurements;
    if (related.length > 0) newItem.related = related;

    if (editingTarget) {
        const oldItem = database[editingTarget.section][editingTarget.index];
        if (oldItem.salePrice) {
            newItem.salePrice = oldItem.salePrice;
            newItem.originalPrice = oldItem.originalPrice;
            newItem.salePercent = oldItem.salePercent;
            newItem.saleEndDate = oldItem.saleEndDate;
        }
        database[editingTarget.section][editingTarget.index] = newItem;
        cancelEdit();
    } else {
        database[section].push(newItem);
        this.reset();
        uploadedImages = [];
        tempAiImageBase64 = '';
        document.getElementById('uploaded-preview').innerHTML = '';
        document.getElementById('measurements-inputs').innerHTML = '';
        addMeasurementRow('S', 'Chest:96cm, Waist:82cm, Length:70cm');
        addMeasurementRow('M', 'Chest:100cm, Waist:86cm, Length:72cm');
        document.getElementById('sizes-inputs').innerHTML = '';
        addSizeRow('S', 5);
        addSizeRow('M', 5);
        addSizeRow('L', 5);
    }
    renderLists();
    generateCode();
});

window.startEdit = function(section, index) {
    editingTarget = { section, index };
    const item = database[section][index];
    document.getElementById('formTitle').innerText = "EDIT PRODUCT";
    document.getElementById('submitBtn').innerText = "UPDATE PRODUCT";
    document.getElementById('submitBtn').classList.replace('bg-black', 'bg-blue-600');
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    
    document.getElementById('prodSection').value = section;
    document.getElementById('prodSection').disabled = true;
    document.getElementById('prodCategory').value = item.category || 'women';
    document.getElementById('prodName').value = item.name;
    document.getElementById('prodPrice').value = item.price;
    document.getElementById('prodDesc').value = item.description || '';
    for (const [code, suffix] of [['it','It'],['fr','Fr'],['de','De']]) {
        const localized = item.translations && item.translations[code] || {};
        document.getElementById('prodName' + suffix).value = localized.name || '';
        document.getElementById('prodDesc' + suffix).value = localized.description || '';
        for (const key of ['Material','Fit','Care','Origin']) {
            document.getElementById('detail' + key + suffix).value = localized.details && localized.details[key] || '';
        }
    }
    if(document.getElementById('prodOutOfStock')) document.getElementById('prodOutOfStock').checked = !!item.isOutOfStock;
    if(document.getElementById('prodVipOnly')) document.getElementById('prodVipOnly').checked = !!item.isVipOnly;
    
    document.getElementById('prodColors').value = item.colors ? item.colors.join(', ') : '';
    
    document.getElementById('sizes-inputs').innerHTML = '';
    if (item.sizes && item.sizes.length > 0) {
        item.sizes.forEach(s => {
            const qty = item.sizeQuantities ? (item.sizeQuantities[s] || 0) : (item.quantity || 0);
            addSizeRow(s, qty);
        });
    } else {
        addSizeRow('OS', item.quantity || 1);
    }
    
    document.getElementById('detailMaterial').value = item.details ? (item.details.Material || '') : '';
    document.getElementById('detailFit').value = item.details ? (item.details.Fit || '') : '';
    document.getElementById('detailCare').value = item.details ? (item.details.Care || '') : '';
    document.getElementById('detailOrigin').value = item.details ? (item.details.Origin || '') : '';
    
    populateMeasurementInputs(item.measurements);
    document.getElementById('prodRelated').value = item.related ? item.related.join(', ') : '';
    
    let itemImages = item.images ? item.images : [item.img];
    if(itemImages[0] && itemImages[0].startsWith('data:image')) {
        document.getElementById('prodImgUrl').value = '';
    } else {
        document.getElementById('prodImgUrl').value = itemImages.join(', ');
    }
    document.getElementById('prodImageFile').value = '';
    uploadedImages = [];
    tempAiImageBase64 = '';
    document.getElementById('uploaded-preview').innerHTML = '';
    
    switchTab('products');
}

window.cancelEdit = function() {
    editingTarget = null;
    document.getElementById('formTitle').innerText = "ADD / EDIT PRODUCT";
    document.getElementById('submitBtn').innerText = "+ ADD PRODUCT";
    document.getElementById('submitBtn').classList.replace('bg-blue-600', 'bg-black');
    document.getElementById('cancelEditBtn').classList.add('hidden');
    document.getElementById('prodSection').disabled = false;
    document.getElementById('addProductForm').reset();
    if(document.getElementById('prodOutOfStock')) document.getElementById('prodOutOfStock').checked = false;
    if(document.getElementById('prodVipOnly')) document.getElementById('prodVipOnly').checked = false;
    uploadedImages = [];
    tempAiImageBase64 = '';
    document.getElementById('uploaded-preview').innerHTML = '';
    
    document.getElementById('measurements-inputs').innerHTML = '';
    addMeasurementRow('S', 'Chest:96cm, Waist:82cm, Length:70cm');
    addMeasurementRow('M', 'Chest:100cm, Waist:86cm, Length:72cm');

    document.getElementById('sizes-inputs').innerHTML = '';
    addSizeRow('S', 5);
    addSizeRow('M', 5);
    addSizeRow('L', 5);
}

window.removeItem = function(section, index) {
    if(confirm("Delete this product?")) {
        database[section].splice(index, 1);
        if(editingTarget && editingTarget.section === section && editingTarget.index === index) cancelEdit();
        renderLists();
        generateCode();
    }
}

function populateSaleSelect() {
    const select = document.getElementById('saleProductSelect');
    let allProducts = [...(database.newArrivals||[]), ...(database.trending||[])];
    const notOnSale = allProducts.filter(p => !p.salePrice);
    
    select.innerHTML = '<option value="">-- Select a product --</option>' +
        notOnSale.map(p => `<option value="${p.name}" data-price="${p.price}">${p.name} (€${p.price})</option>`).join('');
    
    select.onchange = function() {
        const opt = this.options[this.selectedIndex];
        document.getElementById('saleOriginalPrice').value = opt.dataset.price ? '€' + opt.dataset.price : '';
        calculateSalePercent();
    };
}

window.addToSales = function() {
    const select = document.getElementById('saleProductSelect');
    const productName = select.value;
    if (!productName) return alert("Please select a product.");
    const salePrice = parseFloat(document.getElementById('salePriceInput').value);
    const salePercent = parseInt(document.getElementById('salePercentInput').value);
    const saleEndDate = document.getElementById('saleEndDateInput').value;
    if (!salePrice || !salePercent) return alert("Please enter sale price to calculate discount.");
    
    let foundSection = null;
    let foundIndex = -1;
    if (database.newArrivals) foundIndex = database.newArrivals.findIndex(p => p.name === productName);
    if (foundIndex > -1) foundSection = 'newArrivals';
    else {
        if (database.trending) foundIndex = database.trending.findIndex(p => p.name === productName);
        if (foundIndex > -1) foundSection = 'trending';
    }

    if (foundSection) {
        database[foundSection][foundIndex].originalPrice = database[foundSection][foundIndex].price;
        database[foundSection][foundIndex].salePrice = salePrice;
        database[foundSection][foundIndex].salePercent = salePercent;
        if (saleEndDate) { database[foundSection][foundIndex].saleEndDate = saleEndDate; }
        document.getElementById('salePriceInput').value = '';
        document.getElementById('salePercentInput').value = '';
        document.getElementById('saleOriginalPrice').value = '';
        document.getElementById('saleEndDateInput').value = '';
        populateSaleSelect(); renderSalesList(); renderLists(); generateCode();
    }
}

window.removeFromSales = function(productName) {
    if(confirm("Remove this product from sale?")) {
        let foundSection = null;
        let foundIndex = -1;
        if (database.newArrivals) foundIndex = database.newArrivals.findIndex(p => p.name === productName);
        if (foundIndex > -1) foundSection = 'newArrivals';
        else {
            if (database.trending) foundIndex = database.trending.findIndex(p => p.name === productName);
            if (foundIndex > -1) foundSection = 'trending';
        }
        if (foundSection) {
            delete database[foundSection][foundIndex].salePrice;
            delete database[foundSection][foundIndex].originalPrice;
            delete database[foundSection][foundIndex].salePercent;
            delete database[foundSection][foundIndex].saleEndDate;
            populateSaleSelect(); renderSalesList(); renderLists(); generateCode();
        }
    }
}

function renderSalesList() {
    const container = document.getElementById('current-sales-list');
    let allProducts = [...(database.newArrivals||[]), ...(database.trending||[])];
    let salesItems = allProducts.filter(p => p.salePrice);

    if (salesItems.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-gray-400 italic">No products on sale.</p>';
        return;
    }
    container.innerHTML = salesItems.map((s) => {
        const img = s.images ? s.images[0] : s.img;
        return `<div class="sale-card flex items-center gap-3 p-2 bg-red-50 border border-red-100">
            <img src="${img}" class="w-10 h-14 object-cover flex-shrink-0">
            <div class="flex-1 min-w-0">
                <p class="text-[10px] font-bold truncate">${s.name}</p>
                <p class="text-[10px] text-red-600">€${s.salePrice} <span class="text-gray-400 line-through">€${s.originalPrice || s.price}</span> (-${s.salePercent}%)</p>
                ${s.saleEndDate ? `<p class="text-[8px] text-gray-500 mt-1">Ends: ${new Date(s.saleEndDate).toLocaleString()}</p>` : ''}
            </div>
            <button onclick="removeFromSales('${s.name}')" class="text-red-500 hover:text-red-700 text-[10px] font-bold px-2">REMOVE</button>
        </div>`;
    }).join('');
}

window.addPromoCode = function() {
    const code = document.getElementById('newPromoCode').value.trim().toUpperCase();
    const type = document.getElementById('newPromoType').value;
    const val = parseFloat(document.getElementById('newPromoValue').value);
    const maxUses = parseInt(document.getElementById('newPromoMaxUses').value) || 1;
    
    if (!code || !val || maxUses < 1) return alert("Please enter a valid code, amount, and max uses (min 1).");
    
    if (type === 'percent') {
        if (!database.discountCodes) database.discountCodes = {};
        database.discountCodes[code] = { value: val, maxUses: maxUses, uses: 0 };
    } else {
        if (!database.fixedCodes) database.fixedCodes = {};
        database.fixedCodes[code] = { value: val, maxUses: maxUses, uses: 0 };
    }
    
    document.getElementById('newPromoCode').value = '';
    document.getElementById('newPromoValue').value = '';
    document.getElementById('newPromoMaxUses').value = '';
    
    renderPromoCodes(); generateCode();
    showAdminToast(type === 'percent' ? "PROMO CODE CREATED" : "GIFT CARD CREATED");
};

window.removePromoCode = function(code, type) {
    if (confirm(`Delete code ${code}?`)) {
        if (type === 'percent') delete database.discountCodes[code];
        else delete database.fixedCodes[code];
        renderPromoCodes(); generateCode(); showAdminToast("CODE DELETED");
    }
};

function renderPromoCodes() {
    const container = document.getElementById('promo-codes-list');
    if (!container) return;
    
    let html = '';
    
    if (database.discountCodes && Object.keys(database.discountCodes).length > 0) {
        html += Object.entries(database.discountCodes).map(([code, entryRaw]) => {
            const entry = normalizeCodeEntry(entryRaw);
            const remaining = entry.maxUses === Infinity ? '∞' : Math.max(0, entry.maxUses - entry.uses);
            const oneTimeBadge = entry.maxUses === 1 ? `<span class="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] ml-1 font-black border border-red-200">1-USE</span>` : '';
            const unlimitedBadge = entry.maxUses === Infinity ? `<span class="bg-green-100 text-green-600 px-1.5 py-0.5 rounded text-[8px] ml-1 font-black border border-green-200">UNLIMITED</span>` : '';
            const limitText = entry.maxUses !== Infinity ? `<span class="text-[9px] text-gray-400 font-normal ml-1">(${remaining} left)</span>` : '<span class="text-[9px] text-green-500 font-normal ml-1">(unlimited)</span>';
            return `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-gray-50 border border-gray-100 gap-3">
                <div>
                    <p class="text-[10px] font-bold tracking-widest uppercase">${code}${oneTimeBadge}${unlimitedBadge}</p>
                    <p class="text-[10px] text-green-600 font-bold">-${entry.value}% OFF ${limitText}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="sendPromoToSubscribers('${code}', '${entry.value}', 'percent')" class="bg-black text-white px-3 py-1.5 text-[9px] font-bold tracking-wider hover:bg-gray-800 transition-colors">EMAIL TO USERS</button>
                    <button onclick="removePromoCode('${code}', 'percent')" class="text-red-500 hover:text-red-700 text-[10px] font-bold px-2 py-1.5 border border-red-200 bg-white">REMOVE</button>
                </div>
            </div>`;
        }).join('');
    }
    
    if (database.fixedCodes && Object.keys(database.fixedCodes).length > 0) {
        html += Object.entries(database.fixedCodes).map(([code, entryRaw]) => {
            const entry = normalizeCodeEntry(entryRaw);
            const remaining = entry.maxUses === Infinity ? '∞' : Math.max(0, entry.maxUses - entry.uses);
            const oneTimeBadge = entry.maxUses === 1 ? `<span class="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] ml-1 font-black border border-red-200">1-USE</span>` : '';
            const unlimitedBadge = entry.maxUses === Infinity ? `<span class="bg-green-100 text-green-600 px-1.5 py-0.5 rounded text-[8px] ml-1 font-black border border-green-200">UNLIMITED</span>` : '';
            const limitText = entry.maxUses !== Infinity ? `<span class="text-[9px] text-gray-400 font-normal ml-1">(${remaining} left)</span>` : '<span class="text-[9px] text-green-500 font-normal ml-1">(unlimited)</span>';
            return `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-blue-50 border border-blue-100 gap-3">
                <div>
                    <p class="text-[10px] font-bold tracking-widest uppercase">${code}${oneTimeBadge}${unlimitedBadge}</p>
                    <p class="text-[10px] text-blue-600 font-bold">-€${entry.value} GIFT CARD ${limitText}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="sendPromoToSubscribers('${code}', '${entry.value}', 'fixed')" class="bg-blue-600 text-white px-3 py-1.5 text-[9px] font-bold tracking-wider hover:bg-blue-700 transition-colors">EMAIL TO USERS</button>
                    <button onclick="removePromoCode('${code}', 'fixed')" class="text-red-500 hover:text-red-700 text-[10px] font-bold px-2 py-1.5 border border-red-200 bg-white">REMOVE</button>
                </div>
            </div>`;
        }).join('');
    }

    if (html === '') container.innerHTML = '<p class="text-[10px] text-gray-400 italic">No active promo codes or gift cards.</p>';
    else container.innerHTML = html;
}

window.sendPromoToSubscribers = async function(code, amountOrPercent, type) {
    let confirmMsg = type === 'fixed' 
        ? `Email the €${amountOrPercent} GIFT CARD (${code}) to ALL subscribers via Brevo?` 
        : `Email the ${amountOrPercent}% PROMO CODE (${code}) to ALL subscribers via Brevo?`;
        
    if (!confirm(confirmMsg)) return;
    if (typeof showAdminToast === 'function') showAdminToast("FETCHING SUBSCRIBERS FROM DATABASE...");

    let emails = [];
    try {
        const snap = await db.ref("subscribers").once("value");
        if (snap.exists()) {
            snap.forEach((child) => {
                const sub = child.val();
                if (sub.email) emails.push(sub.email);
            });
        }
    } catch(e) { return alert("Database Error: " + e.message); }

    if (emails.length === 0) return alert("No subscribers found in your database!");
    if (typeof showAdminToast === 'function') showAdminToast(`SENDING TO ${emails.length} SUBSCRIBERS...`);

    let payload = {};
    let emailType = '';

    if (type === 'fixed') {
        emailType = 'gift_card'; 
        payload = {
            recipientEmails: emails,
            promoSubject: `A Gift For You: €${amountOrPercent} to spend at SAYAND`,
            bodyText: `We have sent you a €${amountOrPercent} gift card to use on your next order.`,
            discountText: `€${amountOrPercent}`,
            promoCode: code,
            shopUrl: "https://thesayand.com/collection.html"
        };
    } else {
        emailType = 'promo'; 
        let featured = [...(database.newArrivals||[]), ...(database.trending||[])].slice(0, 2);
        let p1 = featured[0] || {};
        let p2 = featured[1] || p1;
        
        payload = { 
            recipientEmails: emails, 
            promoSubject: `Special VIP Offer: ${amountOrPercent}% OFF`,
            subheadline: "Exclusive access for our Atelier members.",
            heroImage: "https://firebasestorage.googleapis.com/v0/b/sayand-store.firebasestorage.app/o/design%2F1782236474067_IMG_5009.jpeg?alt=media",
            tagLine: "VIP PROMO",
            headline: `${amountOrPercent}% OFF YOUR NEXT ORDER`,
            bodyText: "As a thank you for being on the list, enjoy this exclusive code.",
            discountText: `${amountOrPercent}% OFF`,
            promoCode: code,
            expiryDate: "in few days", 
            shopUrl: "https://thesayand.com/",
            productImage1: p1.images ? p1.images[0] : (p1.img || ''),
            productName1: p1.name || '',
            productPrice1: p1.price || '',
            productImage2: p2.images ? p2.images[0] : (p2.img || ''),
            productName2: p2.name || '',
            productPrice2: p2.price || ''
        };
    }

    const sendEmailFn = firebase.functions().httpsCallable('sendStoreEmail');
    try {
        const result = await sendEmailFn({ type: emailType, payload: payload });
        if(result.data && result.data.success) alert(`✅ Successfully broadcasted to ${result.data.sentCount} subscribers!`);
        else alert("Backend Warning: " + (result.data ? result.data.message : "Error"));
    } catch(err) {
        alert("Backend Crash Error: " + err.message);
    }
};

window.sendGiftCardEmail = async function(email) {
    const amount = document.getElementById('giftCardAmount').value;
    const code = document.getElementById('giftCardCode').value.trim().toUpperCase();
    
    if (!amount || !code) return alert("Please enter both an amount and a gift code at the top of the section first.");
    if (!confirm(`Send a €${amount} Gift Card to ${email}?`)) return;

    const sendEmailFn = firebase.functions().httpsCallable('sendStoreEmail');

    try {
        if (typeof showAdminToast === 'function') showAdminToast("SENDING GIFT CARD...");
        await sendEmailFn({
            type: 'gift_card',
            payload: {
                recipientEmails: [email],
                promoSubject: `A Gift For You: €${amount} to spend at SAYAND`,
                bodyText: `We have sent you a €${amount} gift card to use on your next order.`,
                discountText: `€${amount}`,
                promoCode: code,
                shopUrl: "https://thesayand.com/"
            }
        });
        showAdminToast("GIFT CARD SENT!");
        document.getElementById('giftCardAmount').value = '';
        document.getElementById('giftCardCode').value = '';
    } catch (err) {
        alert("Error sending gift card: " + err.message);
    }
};

window.notifySubscribers = async function(productName, productPrice, productImage) {
    if (!confirm(`Send new arrival email for "${productName}" to all subscribers via Brevo?`)) return;
    if (typeof showAdminToast === 'function') showAdminToast("FETCHING SUBSCRIBERS FROM DATABASE...");

    let emails = [];
    try {
        const snap = await db.ref("subscribers").once("value");
        if (snap.exists()) {
            snap.forEach((child) => {
                const sub = child.val();
                if (sub.email) emails.push(sub.email);
            });
        }
    } catch(e) { return alert("Database Error: " + e.message); }

    if (emails.length === 0) return alert("No subscribers found in your database!");
    if (typeof showAdminToast === 'function') showAdminToast(`SENDING TO ${emails.length} SUBSCRIBERS...`);
    
    let others = [...(database.newArrivals||[])].filter(p => p.name !== productName).slice(0, 3);
    if(others.length < 3) others = others.concat([...(database.trending||[])].slice(0, 3 - others.length));
    
    let p2 = others[0] || {}; let p3 = others[1] || {}; let p4 = others[2] || {};

    const sendEmailFn = firebase.functions().httpsCallable('sendStoreEmail');

    try {
        const result = await sendEmailFn({ 
            type: 'new_arrival', 
            payload: { 
                recipientEmails: emails,
                subheadline: "The latest drop is now online.",
                heroImage: productImage,
                tagLine: "NEW ARRIVAL",
                headline: "JUST DROPPED",
                bodyText: "Explore the newest addition to the SAYAND Atelier collection.",
                shopUrl: "https://thesayand.com/",
                productImage1: productImage,
                productName1: productName,
                productPrice1: productPrice,
                productImage2: p2.images ? p2.images[0] : (p2.img || ''),
                productName2: p2.name || '',
                productPrice2: p2.price || '',
                productImage3: p3.images ? p3.images[0] : (p3.img || ''),
                productName3: p3.name || '',
                productPrice3: p3.price || '',
                productImage4: p4.images ? p4.images[0] : (p4.img || ''),
                productName4: p4.name || '',
                productPrice4: p4.price || ''
            } 
        });

        if(result.data && result.data.success) alert(`✅ Successfully broadcasted to ${result.data.sentCount} subscribers!`);
        else alert("Backend Warning: " + (result.data ? result.data.message : "Error"));
    } catch(err) {
        alert("Backend Crash Error: " + err.message);
    }
};

let upcomingImagesData = [];
document.getElementById('upcomingImageFile').addEventListener('change', async function(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    try {
        document.getElementById('upcomingImageUrl').value = "Uploading to cloud...";
        upcomingImagesData = [];
        const urls = [];
        for (const file of files) {
            const fileName = `upcoming/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const storageRef = firebase.storage().ref().child(fileName);
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            urls.push(downloadURL);
        }
        upcomingImagesData = urls;
        document.getElementById('upcomingImageUrl').value = urls.join(', ');
        showAdminToast("TEASER IMAGES UPLOADED!");
    } catch (error) {
        alert("Error uploading image: " + error.message);
        document.getElementById('upcomingImageUrl').value = "";
    }
});

window.addUpcomingSale = function() {
    const name = document.getElementById('upcomingName').value.trim().toUpperCase();
    const price = parseFloat(document.getElementById('upcomingPrice').value);
    const sizesRaw = document.getElementById('upcomingSizes').value;
    const urlRaw = document.getElementById('upcomingImageUrl').value.trim();
    const category = document.getElementById('upcomingCategory').value;
    const isVipOnly = document.getElementById('upcomingVipOnly').checked; 
    
    let finalImages = [];
    if (urlRaw && !urlRaw.includes('Uploading')) finalImages = urlRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    else if (upcomingImagesData.length > 0) finalImages = [...upcomingImagesData];
    
    if (!name || finalImages.length === 0 || !price) return alert("Please provide a name, an image, and an expected price.");
    
    const sizes = sizesRaw ? sizesRaw.split(',').map(s => s.trim().toUpperCase()) : ['OS'];
    
    database.upcomingSales.push({ 
        name, price, sizes, 
        image: finalImages[0], 
        images: finalImages,
        category, 
        isPreorder: true,
        isVipOnly: isVipOnly
    });
    
    document.getElementById('upcomingName').value = '';
    document.getElementById('upcomingPrice').value = '';
    document.getElementById('upcomingSizes').value = '';
    document.getElementById('upcomingImageUrl').value = '';
    document.getElementById('upcomingImageFile').value = '';
    upcomingImagesData = [];
    renderUpcomingList();
    renderLists();
    generateCode();
}

window.removeUpcomingSale = function(index) {
    database.upcomingSales.splice(index, 1);
    renderUpcomingList();
    renderLists();
    generateCode();
}

function renderUpcomingList() {
    const container = document.getElementById('upcoming-list');
    if (!database.upcomingSales || database.upcomingSales.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-gray-400 italic">No upcoming sale teasers.</p>';
        return;
    }
    container.innerHTML = database.upcomingSales.map((u, i) => {
        const thumb = u.image || (u.images && u.images[0]) || '';
        const vipBadge = u.isVipOnly ? `<span class="bg-black text-[#d4af37] px-1 rounded text-[8px] ml-1 border border-[#d4af37]">VIP</span>` : '';
        return `
            <div class="flex items-center gap-3 p-2 bg-gray-50 border border-gray-100">
                <img src="${thumb}" class="w-10 h-14 object-cover flex-shrink-0">
                <div class="flex-1 min-w-0">
                    <p class="text-[10px] font-bold truncate">${u.name} ${vipBadge}</p>
                    <p class="text-[9px] text-gray-400 uppercase tracking-widest">${u.category} | €${u.price}</p>
                </div>
                <button onclick="removeUpcomingSale(${i})" class="text-red-500 hover:text-red-700 text-[10px] font-bold px-2">REMOVE</button>
            </div>
        `;
    }).join('');
}

let dropLaunchInProgress = false;
window.launchDrop = async function(index) {
    if(dropLaunchInProgress) return;
    const item = database.upcomingSales[index];
    if(!item) return alert('This drop no longer exists. Refresh the list.');
    const existing=['newArrivals','trending','sales'].flatMap(section=>Object.values(database[section] || {}));
    if(existing.some(p=>String(p.name || '').trim().toLowerCase()===String(item.name).trim().toLowerCase()))return alert('A product with this name already exists. Edit its stock instead of creating a duplicate.');
    const sizes=[...new Set((Array.isArray(item.sizes)&&item.sizes.length?item.sizes:['OS']).map(String))];
    const sizeQuantities={};
    for(const size of sizes) {
        const prior=item.sizeQuantities?.[size];
        const value=prompt(`Actual stock for ${item.name} — ${size} (whole units, 0 if unavailable):`, Number.isSafeInteger(prior)&&prior>=0?String(prior):'');
        if(value===null)return;
        if(!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value)) || Number(value)>1000000)return alert('Enter a whole stock quantity between 0 and 1,000,000. Nothing was launched.');
        sizeQuantities[size]=Number(value);
    }
    const quantity=Object.values(sizeQuantities).reduce((a,b)=>a+b,0);
    if(!quantity)return alert('Enter available stock before launching this drop.');
    if(!confirm(`Launch ${item.name} with ${quantity} units? This will notify subscribers and update existing reservation carts.`))return;
    const newProduct={name:item.name,price:item.price,images:(item.images?.length?item.images:[item.image]),category:item.category,sizes,sizeQuantities,description:item.description || 'An exclusive SAYAND release.',quantity,isVipOnly:!!item.isVipOnly};
    dropLaunchInProgress=true;
    let saved=false;
    const oldArrivals=[...(database.newArrivals || [])],oldUpcoming=[...database.upcomingSales];
    try {
        database.newArrivals=[...oldArrivals,newProduct];
        database.upcomingSales=oldUpcoming.filter((_,i)=>i!==index);
        await saveStoreSafely();saved=true;
        const preorderKey=item.name.replace(/[.#$\[\]\/]/g,'_');
        const snap=await db.ref('preorders/'+preorderKey).once('value');
        const updates={};let count=0;
        for(const [uid,po] of Object.entries(snap.val() || {})) {
            if(!po || !(sizeQuantities[po.size]>0))continue;
            const cartKey=`${item.name}_${po.size}_Default`.replace(/[^a-zA-Z0-9]/g,'_');
            updates[`users/${uid}/cart/${cartKey}`]={name:item.name,price:item.price,quantity:1,maxStock:sizeQuantities[po.size],image:newProduct.images[0],size:po.size,color:'Default',addedAt:firebase.database.ServerValue.TIMESTAMP};count++;
        }
        if(count)await db.ref().update(updates);
        showAdminToast(`DROP LAUNCHED WITH ${quantity} UNITS. ${count} reservation carts updated.`);
        await notifySubscribers(item.name,item.price,newProduct.images[0]);
    } catch(error) {
        if(!saved){database.newArrivals=oldArrivals;database.upcomingSales=oldUpcoming;}
        alert(saved?'Product launched, but reservation updates or notifications need checking. Do not launch it again.':'Drop not saved. Refresh admin and try again.');
    } finally {dropLaunchInProgress=false;renderLists();}
};

function loadAnnouncementForm() {
    const ann = database.announcement || { text: '', active: false, isPromo: false };
    const textEl = document.getElementById('announcementText');
    const activeEl = document.getElementById('announcementActive');
    const isPromoEl = document.getElementById('announcementIsPromo');
    const minAmtEl = document.getElementById('promoMinAmount');
    const pctEl = document.getElementById('promoPercent');
    const endDateEl = document.getElementById('promoEndDate');
    
    if(textEl) textEl.value = ann.text || '';
    if(activeEl) activeEl.checked = !!ann.active;
    if(isPromoEl) isPromoEl.checked = !!ann.isPromo;
    if(minAmtEl) minAmtEl.value = ann.promoMinAmount || '';
    if(pctEl) pctEl.value = ann.promoPercent || '';
    
    if(endDateEl) {
        if (ann.promoEndDate) {
            const d = new Date(ann.promoEndDate);
            const pad = n => n.toString().padStart(2, '0');
            endDateEl.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else {
            endDateEl.value = '';
        }
    }
    togglePromoFields();
    updatePromoPreview();
}

window.togglePromoFields = function() {
    const isPromo = document.getElementById('announcementIsPromo').checked;
    const fields = document.getElementById('promo-fields');
    if(fields) fields.classList.toggle('hidden', !isPromo);
    updatePromoPreview();
}

window.updatePromoPreview = function() {
    const minAmt = parseFloat(document.getElementById('promoMinAmount').value) || 0;
    const pct = parseFloat(document.getElementById('promoPercent').value) || 0;
    const preview = document.getElementById('promo-preview');
    if(preview) preview.innerText = `Preview: Get ${pct}% off orders above €${minAmt}`;
}

window.updateAnnouncement = function() {
    const isPromo = document.getElementById('announcementIsPromo').checked;
    database.announcement = {
        text: document.getElementById('announcementText').value.trim(),
        active: document.getElementById('announcementActive').checked,
        isPromo: isPromo
    };
    
    if(isPromo) {
        database.announcement.promoMinAmount = parseFloat(document.getElementById('promoMinAmount').value) || 0;
        database.announcement.promoPercent = parseFloat(document.getElementById('promoPercent').value) || 0;
        const localEndDate = document.getElementById('promoEndDate').value;
        database.announcement.promoEndDate = localEndDate ? new Date(localEndDate).toISOString() : '';
    }
    updatePromoPreview();
    generateCode();
};

function loadDesignForm() {
    const sc = database.siteContent;
    for (const [code, suffix] of [['it','It'],['fr','Fr'],['de','De']]) {
        const localized = sc.translations && sc.translations[code] || {};
        for (const field of ['heroSubtitle','heroTitle','editSubtitle','editTitle','editDesc']) {
            document.getElementById(field + suffix).value = localized[field] || '';
        }
    }
    if(document.getElementById('mediaDescriptions')) document.getElementById('mediaDescriptions').value = sc.mediaDescriptions || '';    document.getElementById('heroSubtitle').value = sc.heroSubtitle || '';
    document.getElementById('heroTitle').value = sc.heroTitle || '';
    document.getElementById('heroImg').value = sc.heroImg || '';
    document.getElementById('womenImg').value = sc.womenImg || '';
    document.getElementById('menImg').value = sc.menImg || '';
    document.getElementById('accImg').value = sc.accImg || '';
    document.getElementById('editSubtitle').value = sc.editSubtitle || '';
    document.getElementById('editTitle').value = sc.editTitle || '';
    document.getElementById('editDesc').value = sc.editDesc || '';
    document.getElementById('lbHeroImg').value = sc.lbHeroImg || '';
    document.getElementById('lbWomenImg').value = sc.lbWomenImg || '';
    document.getElementById('lbMenImg').value = sc.lbMenImg || '';
    document.getElementById('lbAccImg').value = sc.lbAccImg || '';
    document.getElementById('lbSaleImg').value = sc.lbSaleImg || '';
    document.getElementById('lbEditCardImg').value = sc.lbEditCardImg || '';
    updateDesignPreviews();
    renderHomepageSlides();
}

 window.updateDesign = function() {
    database.siteContent = database.siteContent || {};
    database.siteContent.translations = database.siteContent.translations || {};
    for (const [code, suffix] of [['it','It'],['fr','Fr'],['de','De']]) {
        const localized = { ...(database.siteContent.translations[code] || {}) };
        for (const field of ['heroSubtitle','heroTitle','editSubtitle','editTitle','editDesc']) {
            localized[field] = document.getElementById(field + suffix).value.trim();
        }
        database.siteContent.translations[code] = localized;
    }

    if (!database.siteContent) database.siteContent = {};
    
    // Safely update properties instead of wiping the whole object
    database.siteContent.editImg = document.getElementById('editImg') ? document.getElementById('editImg').value : '';
    database.siteContent.heroSubtitle = document.getElementById('heroSubtitle') ? document.getElementById('heroSubtitle').value : '';
    database.siteContent.heroTitle = document.getElementById('heroTitle') ? document.getElementById('heroTitle').value : '';
    database.siteContent.heroImg = document.getElementById('heroImg') ? document.getElementById('heroImg').value : '';
    database.siteContent.womenImg = document.getElementById('womenImg') ? document.getElementById('womenImg').value : '';
    database.siteContent.menImg = document.getElementById('menImg') ? document.getElementById('menImg').value : '';
    database.siteContent.accImg = document.getElementById('accImg') ? document.getElementById('accImg').value : '';
    database.siteContent.editSubtitle = document.getElementById('editSubtitle') ? document.getElementById('editSubtitle').value : '';
    database.siteContent.editTitle = document.getElementById('editTitle') ? document.getElementById('editTitle').value : '';
    database.siteContent.editDesc = document.getElementById('editDesc') ? document.getElementById('editDesc').value : '';
    database.siteContent.lbHeroImg = document.getElementById('lbHeroImg') ? document.getElementById('lbHeroImg').value : '';
    database.siteContent.lbWomenImg = document.getElementById('lbWomenImg') ? document.getElementById('lbWomenImg').value : '';
    database.siteContent.lbMenImg = document.getElementById('lbMenImg') ? document.getElementById('lbMenImg').value : '';
    database.siteContent.lbAccImg = document.getElementById('lbAccImg') ? document.getElementById('lbAccImg').value : '';
    database.siteContent.lbSaleImg = document.getElementById('lbSaleImg') ? document.getElementById('lbSaleImg').value : '';
    database.siteContent.lbEditCardImg = document.getElementById('lbEditCardImg') ? document.getElementById('lbEditCardImg').value : '';

    // 🟢 Keep index.html alive with safe placeholders
  database.siteContent.mediaDescriptions = document.getElementById('mediaDescriptions') ? document.getElementById('mediaDescriptions').value : "";
    database.siteContent.hotspots = "";

    updateDesignPreviews();
    generateCode();
}

function loadContactForm() {
    const c = database.contact;
    document.getElementById('returnAddress').value = c.returnAddress || 'SAYAND\nVia Giuseppe di Vittorio 5\n44028 Poggio Renatico (FE)\nItaly';
    document.getElementById('saveReturnAddress').disabled = false;
    document.getElementById('contactEmail').value = c.email || '';
    document.getElementById('contactWhatsapp').value = c.whatsapp || '';
    document.getElementById('contactInstagram').value = c.instagram || '';
    document.getElementById('contactTiktok').value = c.tiktok || '';
    document.getElementById('contactPinterest').value = c.pinterest || '';
    document.getElementById('contactRevolut').value = c.revolut || '';
    document.getElementById('contactPaypal').value = c.paypal || '';
}

window.updateContact = function() {
    database.contact = {
        ...database.contact,
        email: document.getElementById('contactEmail').value,
        whatsapp: document.getElementById('contactWhatsapp').value,
        instagram: document.getElementById('contactInstagram').value,
        tiktok: document.getElementById('contactTiktok').value,
        pinterest: document.getElementById('contactPinterest').value,
        revolut: document.getElementById('contactRevolut').value,
        paypal: document.getElementById('contactPaypal').value
    };
    generateCode();
}

window.quickRestock = function(section, index) {
    const item = database[section][index];
    const newQtyStr = prompt(`QUICK RESTOCK: ${item.name}\n\nEnter the amount of stock to add PER SIZE (e.g. typing '5' adds 5 units to S, 5 to M, etc.):`, "5");
    
    if (newQtyStr !== null && newQtyStr.trim() !== "") {
        const addedQty = parseInt(newQtyStr);
        if (!isNaN(addedQty) && addedQty > 0) {
            item.isOutOfStock = false; 
            let total = 0;
            if (item.sizes && item.sizes.length > 0) {
                if (!item.sizeQuantities) item.sizeQuantities = {};
                item.sizes.forEach(s => {
                    const current = parseInt(item.sizeQuantities[s]) || 0;
                    item.sizeQuantities[s] = current + addedQty;
                    total += item.sizeQuantities[s];
                });
            } else {
                item.sizes = ['OS'];
                item.sizeQuantities = { 'OS': addedQty };
                total = addedQty;
            }
            item.quantity = total;
            generateCode(); 
            renderLists();  
            showAdminToast(`${item.name} RESTOCKED!`);
        } else {
            alert("Please enter a valid number greater than 0.");
        }
    }
}

function renderInventorySection(containerId, items, sectionName) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-gray-400 italic">No items.</p>';
        return;
    }
    items.forEach((item, index) => {
        const thumbImg = item.images ? item.images[0] : item.img;
        const hasDetails = item.details ? '✓' : '';
        const hasMeas = item.measurements ? '⚡' : '';
        
        const isOOS = (item.isOutOfStock || item.quantity <= 0);
        const oosBadge = isOOS ? `<span class="bg-red-100 text-red-600 px-1 rounded text-[8px] ml-1">OOS</span>` : '';
        const vipBadge = item.isVipOnly ? `<span class="bg-black text-[#d4af37] px-1 rounded text-[8px] ml-1 border border-[#d4af37]">VIP</span>` : '';
        
        const safeProdId = item.name.replace(/[^a-zA-Z0-9]/g, '_');
        const notifyCount = stockNotifyCounts[safeProdId] || 0;
        const notifyBadge = notifyCount > 0 ? `<span class="bg-[#d4af37] text-[#1a2e15] px-1.5 rounded text-[8px] ml-1 font-black border border-[#d4af37]">${notifyCount} NOTIFY</span>` : '';

        const restockBtn = isOOS ? `<button onclick="quickRestock('${sectionName}', ${index})" class="text-green-600 hover:text-green-800 text-[9px] font-bold tracking-wider px-2 py-1 border border-green-600 hover:bg-green-50 bg-green-50/30">RESTOCK</button>` : '';

        const div = document.createElement('div');
        div.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors gap-2';
        div.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <img src="${thumbImg}" class="w-10 h-14 object-cover bg-gray-200 flex-shrink-0">
                <div class="min-w-0">
                    <p class="text-[10px] font-bold truncate">${item.name} <span class="text-gray-400 font-normal">${hasDetails}${hasMeas}</span>${oosBadge}${vipBadge}${notifyBadge}</p>
                    <p class="text-[9px] text-gray-400 uppercase tracking-widest">${item.category || 'N/A'}</p>
                    <p class="text-[10px] text-gray-500">€${item.salePrice || item.price}</p>
                </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
                ${restockBtn}
                <button onclick="notifyRestock('${item.name.replace(/'/g, "\\'")}')" class="text-purple-600 hover:text-purple-800 text-[9px] font-bold tracking-wider px-2 py-1 border border-purple-600 hover:bg-purple-50">NOTIFY RESTOCK</button>
                <button onclick="startEdit('${sectionName}', ${index})" class="text-blue-500 hover:text-blue-700 text-[9px] font-bold tracking-wider px-2 py-1 border border-blue-500 hover:bg-blue-50">EDIT</button>
                <button onclick="removeItem('${sectionName}', ${index})" class="text-red-500 hover:text-red-700 text-[9px] font-bold tracking-wider px-2 py-1 border border-red-500 hover:bg-red-50">DEL</button>
            </div>`;
        container.appendChild(div);
    });
}

function renderLists() {
    renderInventorySection('list-newArrivals', database.newArrivals, 'newArrivals');
    renderInventorySection('list-trending', database.trending, 'trending');
    
    const upcomingContainer = document.getElementById('list-upcoming');
    if (upcomingContainer) {
        if (!database.upcomingSales || database.upcomingSales.length === 0) {
            upcomingContainer.innerHTML = '<p class="text-[10px] text-gray-400 italic">No teasers.</p>';
        } else {
            upcomingContainer.innerHTML = database.upcomingSales.map((u, i) => {
                const thumb = u.image || (u.images && u.images[0]) || '';
                const vipBadge = u.isVipOnly ? `<span class="bg-black text-[#d4af37] px-1 rounded text-[8px] ml-1 border border-[#d4af37]">VIP</span>` : '';
                return `
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors gap-2">
                    <div class="flex items-center gap-3 min-w-0">
                        <img src="${thumb}" class="w-10 h-14 object-cover bg-gray-200 flex-shrink-0">
                        <div class="min-w-0">
                            <p class="text-[10px] font-bold truncate">${u.name} ${vipBadge}</p>
                            <p class="text-[9px] text-gray-400 uppercase tracking-widest">${u.category || 'N/A'}</p>
                            <p class="text-[10px] text-[#d4af37] font-bold">TEASER</p>
                        </div>
                    </div>
                    <div class="flex gap-2 flex-shrink-0">
                        <button onclick="launchDrop(${i})" class="text-white bg-black hover:bg-gray-800 text-[9px] font-bold tracking-wider px-3 py-1 transition-colors">🚀 LAUNCH DROP</button>
                        <button onclick="removeUpcomingSale(${i})" class="text-red-500 hover:text-red-700 text-[9px] font-bold tracking-wider px-2 py-1 border border-red-500 hover:bg-red-50">DEL</button>
                    </div>
                </div>
            `}).join('');
        }
    }
}

window.generateCode = function() {
    saveStoreSafely()
        .then(() => {
            console.log("[ADMIN] Cloud Sync Successful! Your store is updated.");
            if(typeof showAdminToast === 'function') showAdminToast("LIVE STORE UPDATED!");
        })
        .catch((error) => alert("Error saving to cloud: " + error.message));
}

const DEFAULT_FOOTER_PAGES = {
    shipping: { title: "SHIPPING INFO", content: `<div class="space-y-6"><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">STANDARD DELIVERY</h4><p class="text-gray-600">Free standard shipping on all orders over €150. Delivery within Italy: 3–7 working days. International delivery: 5–14 working days.</p></div></div>` },
    returns: { title: "RETURNS & EXCHANGES", content: `<div class="space-y-6"><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">RETURN POLICY</h4><p class="text-gray-600">We accept returns within 30 days of purchase. Items must be in original condition.</p></div></div>` },
    size: { title: "SIZE GUIDE", content: `<div class="space-y-6"><p class="text-gray-600">Our garments are designed with a contemporary fit.</p></div>` },
    about: { title: "ABOUT US", content: `<div class="space-y-6"><p class="text-gray-600">SAYAND is a contemporary fashion label founded on the principle that less is always more.</p></div>` },
    careers: { title: "CAREERS", content: `<div class="space-y-6"><p class="text-gray-600">Join the SAYAND team.</p></div>` },
    sustainability: { title: "SUSTAINABILITY", content: `<div class="space-y-6"><p class="text-gray-600">At SAYAND, we are committed to reducing our environmental footprint.</p></div>` },
    press: { title: "PRESS", content: `<div class="space-y-6"><p class="text-gray-600">For press inquiries, image requests, and collaboration proposals, please contact our team.</p></div>` },
    privacy: { title: "PRIVACY POLICY", content: `<div class="space-y-6 text-gray-600"><p>SAYAND respects your privacy and is committed to protecting your personal data.</p></div>` },
    terms: { title: "TERMS OF USE", content: `<div class="space-y-6 text-gray-600"><p>By accessing and using the SAYAND website, you accept and agree to be bound by these terms.</p></div>` },
    cookie: { title: "COOKIE POLICY", content: `<div class="space-y-6 text-gray-600"><p>SAYAND uses cookies and similar technologies to enhance your browsing experience.</p></div>` }
};

function initFooterDefaults() {
    if (!database.footer) database.footer = {};
    Object.entries(DEFAULT_FOOTER_PAGES).forEach(([key, val]) => {
        if (!database.footer[key]) database.footer[key] = JSON.parse(JSON.stringify(val));
    });
}

function loadFooterForm() {
    initFooterDefaults();
    const container = document.getElementById('footer-edit-list');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(database.footer).forEach(([key, page]) => {
        const div = document.createElement('div');
        div.className = 'border border-gray-200 p-3 bg-gray-50';
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <input type="text" class="footer-title w-full text-xs font-bold uppercase tracking-wider border-b border-gray-300 bg-transparent focus:outline-none focus:border-black mr-2" value="${page.title}" data-key="${key}" oninput="updateFooter('${key}')">
                <button onclick="removeFooterPage('${key}')" class="text-red-500 hover:text-red-700 text-xs font-bold px-2">&times;</button>
            </div>
            <textarea class="footer-content w-full text-[10px] border border-gray-300 p-2 focus:outline-none focus:border-black h-20" data-key="${key}" oninput="updateFooter('${key}')">${page.content}</textarea>
            <details class="mt-3 border-t pt-2">
                <summary class="text-xs font-bold cursor-pointer">Italian page text (optional)</summary>
                <input type="text" class="footer-title-it w-full text-xs border p-2 mt-2" placeholder="Italian title" value="${escapeAdminTranslation(page.translations && page.translations.it && page.translations.it.title)}" data-key="${key}" oninput="updateFooter('${key}')">
                <textarea class="footer-content-it w-full text-xs border p-2 mt-2 h-24" placeholder="Italian content (same HTML format as the original)" data-key="${key}" oninput="updateFooter('${key}')">${escapeAdminTranslation(page.translations && page.translations.it && page.translations.it.content)}</textarea>
            </details>
            <details class="mt-3 border-t pt-2">
                <summary class="text-xs font-bold cursor-pointer">German page text (optional)</summary>
                <input type="text" class="footer-title-de w-full text-xs border p-2 mt-2" placeholder="German title" value="${escapeAdminTranslation(page.translations && page.translations.de && page.translations.de.title)}" data-key="${key}" oninput="updateFooter('${key}')">
                <textarea class="footer-content-de w-full text-xs border p-2 mt-2 h-24" placeholder="German content (same HTML format as the original)" data-key="${key}" oninput="updateFooter('${key}')">${escapeAdminTranslation(page.translations && page.translations.de && page.translations.de.content)}</textarea>
            </details>
            <details class="mt-3 border-t pt-2">
                <summary class="text-xs font-bold cursor-pointer">French page text (optional)</summary>
                <input type="text" class="footer-title-fr w-full text-xs border p-2 mt-2" placeholder="French title" value="${escapeAdminTranslation(page.translations && page.translations.fr && page.translations.fr.title)}" data-key="${key}" oninput="updateFooter('${key}')">
                <textarea class="footer-content-fr w-full text-xs border p-2 mt-2 h-24" placeholder="French content (same HTML format as the original)" data-key="${key}" oninput="updateFooter('${key}')">${escapeAdminTranslation(page.translations && page.translations.fr && page.translations.fr.content)}</textarea>
            </details>
            <p class="text-[9px] text-gray-400 mt-1 font-mono">KEY: ${key}</p>
        `;
        container.appendChild(div);
    });
}

window.updateFooter = function(key) {
    const titleInput = document.querySelector(`.footer-title[data-key="${key}"]`);
    const contentInput = document.querySelector(`.footer-content[data-key="${key}"]`);
    if (titleInput && contentInput) {
        const existing = database.footer[key] || {};
        const translations = { ...(existing.translations || {}) };
        for (const code of ['it','fr','de']) {
            translations[code] = {
                ...(translations[code] || {}),
                title: document.querySelector(`.footer-title-${code}[data-key="${key}"]`).value,
                content: document.querySelector(`.footer-content-${code}[data-key="${key}"]`).value
            };
        }
        database.footer[key] = { ...existing, title: titleInput.value, content: contentInput.value, translations };
        generateCode();
    }
};

window.addFooterPage = function() {
    const keyInput = document.getElementById('newFooterKey');
    const titleInput = document.getElementById('newFooterTitle');
    const key = keyInput.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const title = titleInput.value.trim();
    if (!key || !title) return alert("Please enter a key and title.");
    if (database.footer[key]) return alert("A page with this key already exists.");
    database.footer[key] = { title: title, content: '<p class="text-gray-600">New page content.</p>' };
    keyInput.value = '';
    titleInput.value = '';
    loadFooterForm();
    generateCode();
};

window.removeFooterPage = function(key) {
    if (!confirm(`Delete footer page "${database.footer[key]?.title || key}"?`)) return;
    delete database.footer[key];
    loadFooterForm();
    generateCode();
};

function loadSubscribers() {
    const tbody = document.getElementById('subscribers-list');
    const emptyMsg = document.getElementById('subscribers-empty');
    if (!tbody) return;
    tbody.innerHTML = '';
    db.ref("subscribers").once("value").then((snapshot) => {
        if (!snapshot.exists()) { emptyMsg.style.display = 'block'; return; }
        emptyMsg.style.display = 'none';
        const subscribers = [];
        snapshot.forEach((child) => { subscribers.push({ id: child.key, ...child.val() }); });
        subscribers.sort((a, b) => new Date(b.subscribedAt) - new Date(a.subscribedAt));
        subscribers.forEach((sub) => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-100 hover:bg-gray-50';
            const date = sub.subscribedAt ? new Date(sub.subscribedAt).toLocaleDateString() : 'N/A';
            row.innerHTML = `<td class="p-3 font-mono text-[10px]">${sub.email}</td><td class="p-3 text-gray-500">${date}</td><td class="p-3 text-right">
                <button onclick="sendGiftCardEmail('${sub.email}')" class="text-blue-600 border border-blue-600 px-2 py-1 hover:bg-blue-50 transition-colors text-[9px] font-bold mr-2">GIFT</button>
                <button onclick="inviteToAtelier('${sub.email}', '')" class="text-[#d4af37] border border-[#d4af37] px-2 py-1 hover:bg-[#f9f6ea] transition-colors text-[9px] font-bold mr-2">VIP INVITE</button>
                <button onclick="deleteSubscriber('${sub.id}')" class="text-red-500 hover:text-red-700 text-[9px] font-bold">DELETE</button>
            </td>`;
            tbody.appendChild(row);
        });
    });
}

window.deleteSubscriber = function(id) {
    if (!confirm('Delete this subscriber?')) return;
    db.ref("subscribers/" + id).remove().then(() => { showAdminToast('SUBSCRIBER DELETED'); loadSubscribers(); });
};

window.exportSubscribers = function() {
    db.ref("subscribers").once("value").then((snapshot) => {
        if (!snapshot.exists()) return alert('No subscribers to export.');
        let csv = 'Email,Subscribed Date,Source\n';
        snapshot.forEach((child) => { const sub = child.val(); csv += `"${sub.email}","${sub.subscribedAt || ''}","${sub.source || ''}"\n`; });
        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'sayand_subscribers.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showAdminToast('CSV EXPORTED!');
    });
};

window.loadReviews = function() {
    const tbody = document.getElementById('reviews-list');
    const emptyMsg = document.getElementById('reviews-empty');
    if (!tbody) return;
    tbody.innerHTML = '';
    db.ref("reviews").once("value").then((snapshot) => {
        if (!snapshot.exists()) { emptyMsg.style.display = 'block'; return; }
        emptyMsg.style.display = 'none';
        const allReviews = [];
        snapshot.forEach((productNode) => {
            const productName = productNode.key;
            productNode.forEach((reviewNode) => {
                allReviews.push({ productId: productName, reviewId: reviewNode.key, ...reviewNode.val() });
            });
        });
        allReviews.sort((a, b) => b.timestamp - a.timestamp);
        if (allReviews.length === 0) { emptyMsg.style.display = 'block'; return; }
        allReviews.forEach((rev) => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-100 hover:bg-gray-50';
            const date = new Date(rev.timestamp).toLocaleDateString();
            const rating=Math.max(1,Math.min(5,Number(rev.rating)||1)); const stars='★'.repeat(rating)+'☆'.repeat(5-rating);
            row.innerHTML = `
                <td class="p-3 text-[10px] font-bold uppercase">${escapeAdminTranslation(rev.productId.replace(/_/g, ' '))}</td>
                <td class="p-3"><div class="text-[10px] font-bold">${escapeAdminTranslation(rev.name || 'Customer')}</div><div class="text-[#d4af37] text-[12px]">${stars}</div><div class="text-[9px] text-gray-400">${date}</div></td>
                <td class="p-3 text-[11px] text-gray-600 max-w-xs italic">"${escapeAdminTranslation(rev.text || '')}"</td>
                <td class="p-3 text-right space-x-2"><button onclick="deleteReview('${rev.productId}', '${rev.reviewId}')" class="text-red-500 hover:text-red-700 text-[9px] font-bold tracking-wider px-2 py-1 border border-red-500 hover:bg-red-50">DEL</button></td>
            `;
            tbody.appendChild(row);
        });
    });
};

window.deleteReview = function(productId, reviewId) {
    if(confirm("Permanently delete this review from the product page?")) {
        db.ref(`reviews/${productId}/${reviewId}`).remove().then(() => { showAdminToast("REVIEW DELETED!"); loadReviews(); }).catch(e => alert("Error: " + e.message));
    }
};

window.filterOrders = function() {
    const query = document.getElementById('orderSearchInput').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.order-card');
    cards.forEach(card => {
        const cardText = card.innerText.toLowerCase();
        card.style.display = cardText.includes(query) ? 'block' : 'none';
    });
};

// ─── MAGAZINE-BASED LOOKBOOK MANAGER ───

let editingLookbookIndex = null;

// Auto-migrate old single-image slides to the new Article format
function migrateLookbookData() {
    if (database.lookbook && database.lookbook.length > 0) {
        database.lookbook = database.lookbook.map(item => {
            if (item.url && !item.urls) { 
                return {
                    id: item.id,
                    title: 'Archived Campaign',
                    subtitle: 'EDITORIAL',
                    description: item.description || '',
                    urls: [item.url],
                    hotspots: { "0": item.hotspots || [] }
                };
            }
            return item;
        });
    }
}

window.renderLookbookSlides = function() {
    migrateLookbookData();
    const container = document.getElementById('lookbook-slides-list');
    if (!container) return;

    if (!database.lookbook || database.lookbook.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-gray-400 italic font-bold">No articles published yet.</p>';
        return;
    }

    container.innerHTML = database.lookbook.map((article, idx) => {
        const coverUrl = article.urls[0] || '';
        const isVideo = coverUrl.toLowerCase().match(/\.(mp4|mov|webm)(\?.*)?$/);
        
        const mediaHtml = isVideo 
            ? `<video src="${coverUrl}" class="w-16 h-20 object-cover bg-black flex-shrink-0" muted playsinline></video>`
            : `<img src="${coverUrl}" class="w-16 h-20 object-cover bg-[#eef2ec] border border-[#c2c9c0] flex-shrink-0">`;
        
        let totalSpots = 0;
        if (article.hotspots) {
            Object.values(article.hotspots).forEach(arr => totalSpots += (arr ? arr.length : 0));
        }

        return `
        <div class="flex items-start gap-3 p-3 bg-white border border-[#c2c9c0] shadow-sm">
            ${mediaHtml}
            <div class="flex-1 min-w-0">
                <p class="text-[10px] font-black text-[#1a2e15] mb-1 tracking-widest uppercase">${article.subtitle} | ${article.title}</p>
                <p class="text-[9px] text-[#6a7c64] font-medium truncate w-full pr-2">${article.description || 'No description'}</p>
                <p class="text-[9px] text-[#d4af37] font-black mt-2 uppercase tracking-widest">${article.urls.length} MEDIA ITEM(S) • ${totalSpots} TAG(S)</p>
            </div>
            <div class="flex flex-col gap-2">
                <button type="button" onclick="startEditLookbook(${idx})" class="text-blue-600 hover:text-blue-800 text-[9px] font-black px-3 border border-blue-200 bg-blue-50 py-1 transition-colors uppercase tracking-widest">EDIT</button>
                <button type="button" onclick="removeLookbookSlide(${idx})" class="text-red-500 hover:text-red-700 text-[9px] font-black px-3 border border-red-200 bg-red-50 py-1 transition-colors uppercase tracking-widest">DEL</button>
            </div>
        </div>
        `;
    }).join('');
    
    updateHotspotArticleDropdown();
};

window.addLookbookArticle = async function() {
    const title = document.getElementById('lbTitle').value.trim();
    const subtitle = document.getElementById('lbSubtitle').value.trim();
    const desc = document.getElementById('lbDesc').value.trim();
    const articleTranslations = {};
    for (const [code, suffix] of [['it','It'],['fr','Fr'],['de','De']]) {
        articleTranslations[code] = {
            title: document.getElementById('lbTitle' + suffix).value.trim(),
            subtitle: document.getElementById('lbSubtitle' + suffix).value.trim(),
            description: document.getElementById('lbDesc' + suffix).value.trim()
        };
    }
    const fileInput = document.getElementById('lbFile');
    const urlInput = document.getElementById('lbUrl').value.trim();
    const btn = document.getElementById('lbSubmitBtn');

    if (!title || !subtitle) return alert("Title and Subheading are required.");

    let finalUrls = [];
    if (urlInput) {
        finalUrls = urlInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    if (btn) { btn.innerText = "PROCESSING..."; btn.disabled = true; }

    try {
        if (fileInput && fileInput.files.length > 0) {
            if(btn) btn.innerText = `UPLOADING ${fileInput.files.length} FILE(S)...`;
            for (let i = 0; i < fileInput.files.length; i++) {
                const file = fileInput.files[i];
                const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                const storageRef = firebase.storage().ref().child(`lookbook/${Date.now()}_${safeName}`);
                const snapshot = await storageRef.put(file);
                const downloadURL = await snapshot.ref.getDownloadURL();
                finalUrls.push(downloadURL);
            }
        }

        if (!database.lookbook) database.lookbook = [];

        if (editingLookbookIndex !== null) {
            // Editing existing
            database.lookbook[editingLookbookIndex].title = title;
            database.lookbook[editingLookbookIndex].subtitle = subtitle;
            database.lookbook[editingLookbookIndex].description = desc;
            database.lookbook[editingLookbookIndex].translations = {
                ...(database.lookbook[editingLookbookIndex].translations || {}), ...articleTranslations
            };
            if (finalUrls.length > 0) {
                // Append new images to existing array
                database.lookbook[editingLookbookIndex].urls = [...database.lookbook[editingLookbookIndex].urls, ...finalUrls];
            }
            showAdminToast("ARTICLE UPDATED!");
        } else {
            // Creating new
            if (finalUrls.length === 0) throw new Error("Please upload images or paste URLs.");
            database.lookbook.push({
                id: 'lb_' + Date.now(),
                title: title,
                subtitle: subtitle,
                description: desc,
                translations: articleTranslations,
                urls: finalUrls,
                hotspots: {} // Maps image index to hotspot array: { "0": [], "1": [] }
            });
            showAdminToast("ARTICLE PUBLISHED!");
        }

        generateCode(); 
        cancelEditLookbook();
        renderLookbookSlides();

    } catch (err) {
        alert(err.message);
    } finally {
        if(btn) { btn.innerText = "+ PUBLISH ARTICLE"; btn.disabled = false; }
    }
};

window.startEditLookbook = function(idx) {
    editingLookbookIndex = idx;
    const article = database.lookbook[idx];
    
    document.getElementById('lookbookFormTitle').innerText = "EDITING: " + article.title;
    document.getElementById('lbSubmitBtn').innerText = "SAVE CHANGES";
    document.getElementById('lbSubmitBtn').classList.replace('bg-[#1a2e15]', 'bg-blue-600');
    document.getElementById('cancelLookbookEditBtn').classList.remove('hidden');

    document.getElementById('lbTitle').value = article.title || '';
    document.getElementById('lbSubtitle').value = article.subtitle || '';
    document.getElementById('lbDesc').value = article.description || '';
    for (const [code, suffix] of [['it','It'],['fr','Fr'],['de','De']]) {
        const localized = article.translations && article.translations[code] || {};
        document.getElementById('lbTitle' + suffix).value = localized.title || '';
        document.getElementById('lbSubtitle' + suffix).value = localized.subtitle || '';
        document.getElementById('lbDesc' + suffix).value = localized.description || '';
    }
    document.getElementById('lbUrl').value = '';
    document.getElementById('lbFile').value = '';
    
    // Note: Uploading files during edit will *append* them to the gallery.
    document.getElementById('lookbookFormTitle').scrollIntoView({behavior: "smooth"});
};

window.cancelEditLookbook = function() {
    editingLookbookIndex = null;
    document.getElementById('lookbookFormTitle').innerText = "1. CREATE / EDIT ARTICLE";
    document.getElementById('lbSubmitBtn').innerText = "+ PUBLISH ARTICLE";
    document.getElementById('lbSubmitBtn').classList.replace('bg-blue-600', 'bg-[#1a2e15]');
    document.getElementById('cancelLookbookEditBtn').classList.add('hidden');
    
    document.getElementById('lbTitle').value = '';
    document.getElementById('lbSubtitle').value = '';
    document.getElementById('lbDesc').value = '';
    for (const suffix of ['It','Fr','De']) {
        for (const field of ['lbTitle','lbSubtitle','lbDesc']) document.getElementById(field + suffix).value = '';
    }
    document.getElementById('lbUrl').value = '';
    document.getElementById('lbFile').value = '';
};

window.removeLookbookSlide = function(idx) {
    if (!confirm("Permanently delete this article and all its data?")) return;
    database.lookbook.splice(idx, 1);
    generateCode();
    renderLookbookSlides();
    showAdminToast("ARTICLE DELETED!");
};

// ─── HOTSPOT ENGINE (UPDATED FOR GALLERIES) ───

window.updateHotspotArticleDropdown = function() {
    const articleSelect = document.getElementById('hotspotArticleSelect');
    if(!articleSelect) return;
    
    if (!database.lookbook || database.lookbook.length === 0) {
        articleSelect.innerHTML = '<option value="">No articles</option>';
        updateHotspotImageDropdown();
        return;
    }
    
    const currentVal = articleSelect.value;
    articleSelect.innerHTML = database.lookbook.map((art, i) => `<option value="${i}">${art.title}</option>`).join('');
    if(currentVal && database.lookbook[currentVal]) articleSelect.value = currentVal;
    
    updateHotspotImageDropdown();
};

window.updateHotspotImageDropdown = function() {
    const articleIdx = document.getElementById('hotspotArticleSelect').value;
    const imgSelect = document.getElementById('hotspotImageSelect');
    if(!imgSelect) return;

    if (!articleIdx || !database.lookbook[articleIdx] || !database.lookbook[articleIdx].urls) {
        imgSelect.innerHTML = '<option value="">No media</option>';
        loadHotspotEditor();
        return;
    }

    const article = database.lookbook[articleIdx];
    const currentImgVal = imgSelect.value;
    
    imgSelect.innerHTML = article.urls.map((url, i) => `<option value="${i}">Image ${i+1}</option>`).join('');
    if(currentImgVal && article.urls[currentImgVal]) imgSelect.value = currentImgVal;

    loadHotspotEditor();
};

window.loadHotspotEditor = function() {
    const articleIdx = document.getElementById('hotspotArticleSelect').value;
    const imgIdx = document.getElementById('hotspotImageSelect').value;
    const prodSelect = document.getElementById('hotspotProductSelect');
    const markersContainer = document.getElementById('hotspot-markers');
    const listContainer = document.getElementById('hotspot-list');
    
    let allProds = [...(database.newArrivals||[]), ...(database.trending||[])];
    const currentProdVal = prodSelect ? prodSelect.value : '';
    if(prodSelect) {
        prodSelect.innerHTML = '<option value="">-- Select Product --</option>' + 
            allProds.map(p => `<option value="${p.name.replace(/"/g, '&quot;')}">${p.name}</option>`).join('');
        if(currentProdVal) prodSelect.value = currentProdVal;
    }

    const editorContainer = document.getElementById('hotspot-editor-container');
    let oldMedia = document.getElementById('hotspot-editor-img');
    if (oldMedia) oldMedia.remove();
    if(markersContainer) markersContainer.innerHTML = '';
    if(listContainer) listContainer.innerHTML = '';

    if (!articleIdx || !imgIdx || !database.lookbook[articleIdx]) return;
    
    const article = database.lookbook[articleIdx];
    const activeUrl = article.urls[imgIdx];
    if (!activeUrl) return;
    
    const isVideo = activeUrl.toLowerCase().match(/\.(mp4|mov|webm)(\?.*)?$/);
    const newMedia = document.createElement(isVideo ? 'video' : 'img');
    newMedia.id = 'hotspot-editor-img';
    newMedia.src = activeUrl;
    newMedia.className = 'w-full h-auto pointer-events-none min-h-[150px]';
    if (isVideo) { newMedia.autoplay = true; newMedia.loop = true; newMedia.muted = true; newMedia.playsInline = true; }
    if(editorContainer && markersContainer) editorContainer.insertBefore(newMedia, markersContainer);

    if(!article.hotspots) article.hotspots = {};
    const spots = article.hotspots[imgIdx] || [];
    
    if(spots.length > 0) {
        spots.forEach((spot, idx) => {
            if(markersContainer) {
                markersContainer.innerHTML += `<div class="absolute w-3 h-3 bg-white border-2 border-black rounded-full -ml-1.5 -mt-1.5 shadow-lg" style="left: ${spot.x}%; top: ${spot.y}%;"></div>`;
            }
            if(listContainer) {
                listContainer.innerHTML += `
                    <div class="flex justify-between items-center bg-white p-2 border border-gray-200 shadow-sm text-[10px]">
                        <span><span class="font-bold text-gray-400">TAGGED:</span> ${spot.product}</span>
                        <button onclick="removeHotspot(${articleIdx}, ${imgIdx}, ${idx})" class="text-red-500 font-bold px-2 py-1">REMOVE</button>
                    </div>`;
            }
        });
    } else {
        if(listContainer) listContainer.innerHTML = '<p class="text-[9px] text-gray-400 italic">No tags placed on this specific image yet.</p>';
    }
}

window.addHotspot = function(e) {
    const articleIdx = document.getElementById('hotspotArticleSelect').value;
    const imgIdx = document.getElementById('hotspotImageSelect').value;
    const prodSelect = document.getElementById('hotspotProductSelect');
    const prodName = prodSelect ? prodSelect.value : null;
    
    if(!articleIdx || !imgIdx) return alert("Please select an article and image first.");
    if(!prodName) return alert("Select a product from the dropdown FIRST, then click the image to place the pin.");

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const article = database.lookbook[articleIdx];
    if(!article.hotspots) article.hotspots = {};
    if(!article.hotspots[imgIdx]) article.hotspots[imgIdx] = [];
    
    article.hotspots[imgIdx].push({ x: x.toFixed(2), y: y.toFixed(2), product: prodName });
    
    if(prodSelect) prodSelect.value = ''; 
    loadHotspotEditor();
    generateCode(); 
    showAdminToast("HOTSPOT TAGGED!");
}

window.removeHotspot = function(articleIdx, imgIdx, spotIdx) {
    database.lookbook[articleIdx].hotspots[imgIdx].splice(spotIdx, 1);
    loadHotspotEditor();
    generateCode();
}

// ─── HOMEPAGE CAROUSEL MANAGER LOGIC ───

window.renderHomepageSlides = function() {
    const container = document.getElementById('homepage-carousel-list');
    if (!container) return;

    let editImgStr = database.siteContent.editImg || '';
    let urls = editImgStr.split(',').map(s=>s.trim()).filter(s=>s);

    if (urls.length === 0) {
        container.innerHTML = '<p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest text-center py-4">No media in homepage carousel.</p>';
        return;
    }

    container.innerHTML = urls.map((url, idx) => {
        const isVideo = url.toLowerCase().match(/\.(mp4|mov|webm)(\?.*)?$/);
        const mediaHtml = isVideo 
            ? `<video src="${url}" class="w-12 h-16 object-cover bg-black flex-shrink-0 border border-gray-300" muted playsinline></video>`
            : `<img src="${url}" class="w-12 h-16 object-cover bg-white flex-shrink-0 border border-gray-300">`;

        return `
        <div class="flex items-center gap-3 p-2 bg-white border border-gray-200 shadow-sm">
            ${mediaHtml}
            <div class="flex-1 min-w-0 overflow-hidden">
                <p class="text-[9px] font-black tracking-widest text-[#1a2e15] mb-1">SLIDE ${idx + 1}</p>
                <p class="text-[8px] text-gray-400 truncate w-full pr-2">${url}</p>
            </div>
            <button type="button" onclick="removeHomepageSlide('${url}')" class="text-red-500 hover:text-red-700 text-[9px] font-black px-3 py-1.5 border border-red-200 bg-red-50 transition-colors tracking-widest">DEL</button>
        </div>
        `;
    }).join('');
};

window.addHomepageSlide = async function() {
    const fileInput = document.getElementById('hpCarouselFile');
    const urlInput = document.getElementById('hpCarouselUrl');
    const btn = document.querySelector('button[onclick="addHomepageSlide()"]');

    if(btn) { btn.innerText = "UPLOADING..."; btn.disabled = true; }

    try {
        let newUrls = [];
        if (urlInput && urlInput.value.trim()) newUrls.push(urlInput.value.trim());

        if (fileInput && fileInput.files.length > 0) {
            if(btn) btn.innerText = `UPLOADING ${fileInput.files.length} FILE(S)...`;
            for (let i = 0; i < fileInput.files.length; i++) {
                const file = fileInput.files[i];
                const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                const storageRef = firebase.storage().ref().child(`design/${Date.now()}_${safeName}`);
                const snapshot = await storageRef.put(file);
                const downloadURL = await snapshot.ref.getDownloadURL();
                newUrls.push(downloadURL);
            }
        }

        if (newUrls.length === 0) {
            alert("Please select files or paste a URL.");
            if(btn) { btn.innerText = "+ ADD TO CAROUSEL"; btn.disabled = false; }
            return;
        }

        let currentUrls = (database.siteContent.editImg || '').split(',').map(s=>s.trim()).filter(s=>s);
        currentUrls = currentUrls.concat(newUrls); // Add new files to the end of the list
        database.siteContent.editImg = currentUrls.join(', ');
        
        const hiddenInput = document.getElementById('editImg');
        if (hiddenInput) hiddenInput.value = database.siteContent.editImg;

        if(fileInput) fileInput.value = '';
        if(urlInput) urlInput.value = '';

        updateDesign(); 
        renderHomepageSlides();
        showAdminToast("CAROUSEL UPDATED!");

    } catch(err) {
        alert("Error: " + err.message);
    } finally {
        if(btn) { btn.innerText = "+ ADD TO CAROUSEL"; btn.disabled = false; }
    }
};

window.removeHomepageSlide = function(urlToRemove) {
    if(!confirm("Remove this slide from the homepage carousel?")) return;
    
    let currentUrls = (database.siteContent.editImg || '').split(',').map(s=>s.trim()).filter(s=>s);
    currentUrls = currentUrls.filter(u => u !== urlToRemove);
    
    database.siteContent.editImg = currentUrls.join(', ');
    
    const hiddenInput = document.getElementById('editImg');
    if (hiddenInput) hiddenInput.value = database.siteContent.editImg;

    updateDesign();
    renderHomepageSlides();
    showAdminToast("SLIDE REMOVED!");
};

// STARTUP TRIGGERS
addSizeRow('S', 5);
addSizeRow('M', 5);
addSizeRow('L', 5);

setTimeout(() => {
    console.log("[ADMIN] Triggering initial renders...");
    if (typeof renderLookbookSlides === 'function') renderLookbookSlides();
}, 1500);
// Save only the return address, without overwriting other store settings.
window.saveReturnAddress = async function() {
    const input = document.getElementById('returnAddress');
    const button = document.getElementById('saveReturnAddress');
    const status = document.getElementById('returnAddressStatus');
    const address = input.value.trim();
    if (!address || address.length > 1000) {
        status.textContent = 'Enter a complete return address (maximum 1,000 characters).';
        input.focus();
        return;
    }
    button.disabled = true;
    status.textContent = 'Saving...';
    try {
        await db.ref('mainStore/contact/returnAddress').set(address);
        database.contact.returnAddress = address;
        status.textContent = 'Return address saved. The Returns page now uses this address.';
        showAdminToast('RETURN ADDRESS SAVED!');
    } catch (error) {
        status.textContent = 'Unable to save. Please try again. ' + error.message;
    } finally {
        button.disabled = false;
    }
};
