const sayandAlt = value => String(value || '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
// ==================== PREVENT BROWSER SCROLL RESTORATION ====================
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

// Global Variables
window.userFitPrefs = null;
window.userIsVip = false;
window.authSettled = false;
// ==================== CURRENCY SWITCHER ====================
window.currentCurrency = localStorage.getItem('sayand_currency') || 'EUR';
const CURRENCY_RATES = { EUR: 1, USD: 1.09, GBP: 0.84 };
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };

async function fetchLiveRates() {
    try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
        const data = await res.json();
        if (data && data.rates) {
            if (data.rates.USD) CURRENCY_RATES.USD = data.rates.USD;
            if (data.rates.GBP) CURRENCY_RATES.GBP = data.rates.GBP;
        }
    } catch (e) { console.log('[SAYAND] Using default currency rates'); }
}
fetchLiveRates();

window.formatPrice = function(priceEUR) {
    if (!priceEUR) return CURRENCY_SYMBOLS[window.currentCurrency] + '0.00';
    const rate = CURRENCY_RATES[window.currentCurrency] || 1;
    const converted = (parseFloat(priceEUR) * rate).toFixed(2);
    return (CURRENCY_SYMBOLS[window.currentCurrency] || '€') + converted;
};

window.setCurrency = function(curr) {
    window.currentCurrency = curr;
    localStorage.setItem('sayand_currency', curr);
    const toggle = document.getElementById('currency-toggle');
    if (toggle) toggle.innerText = curr;
    if (typeof renderAllProducts === 'function' && window.SAYAND_PRODUCTS) {
        renderAllProducts(window.SAYAND_PRODUCTS);
    }
    if (currentDetailProduct) {
        const activeSale = isSaleActive(currentDetailProduct);
        const basePrice = activeSale ? currentDetailProduct.salePrice : currentDetailProduct.price;
        const priceEl = document.getElementById('detail-price');
        const origEl = document.getElementById('detail-original-price');
        if (priceEl) {
            if (activeSale) {
                const salePct = getSalePercentage(currentDetailProduct);
                priceEl.innerHTML = formatPrice(basePrice) + (salePct ? ` <span class="text-red-600 text-sm font-black ml-1">-${salePct}%</span>` : '');
                priceEl.classList.add('text-red-600');
            } else {
                priceEl.innerText = formatPrice(basePrice);
                priceEl.classList.remove('text-red-600');
            }
        }
        if (origEl && activeSale) {
            origEl.innerText = formatPrice(currentDetailProduct.originalPrice || currentDetailProduct.price);
            origEl.classList.remove('hidden');
        }
    }
    if (typeof renderRecentlyViewed === 'function') renderRecentlyViewed();
    // Re-render cart with new currency
    if (typeof window.renderCart === 'function') {
        window.renderCart(window._lastCartData);
    }
};

// ==================== COOKIE CONSENT ====================
window.acceptCookies = function() { if(window.SayandConsent) window.SayandConsent.open(); };
function initCookieBanner() { /* Shared consent.js owns the controls on every page. */ }
let visitorTrackingInFlight = false;
async function trackConsentingVisitor() {
    if (!window.SayandConsent || !window.SayandConsent.allowed('analytics') || visitorTrackingInFlight) return;
    if (typeof firebase === 'undefined' || !firebase.database) return;
    try {
        if (localStorage.getItem('sayand_visitor_id')) return;
        visitorTrackingInFlight = true;
        const visitorId = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2,11);
        await firebase.database().ref('uniqueVisitors/' + visitorId).set({firstVisit:firebase.database.ServerValue.TIMESTAMP,userAgent:navigator.userAgent.slice(0,300)});
        if (window.SayandConsent.allowed('analytics')) localStorage.setItem('sayand_visitor_id',visitorId);
    } catch (error) { console.error('Visitor statistics unavailable:',error); }
    finally { visitorTrackingInFlight=false; }
}
window.addEventListener('sayand:consentchange',()=>{trackConsentingVisitor();if(window.renderRecentlyViewed)window.renderRecentlyViewed();});

// ==================== ANNOUNCEMENT BAR ====================
let announcementCountdownInterval = null;

// Announcement bar is permanent — users cannot dismiss it

// A wrapped mobile announcement must reserve its actual height, not a fixed 32px.
function announcementText(value, data) {let text=String(value??'');if(data?.isPromo && Number(data.promoMinAmount)>=0)text=text.replace(/\babove\s*€\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi,(match,amount)=>Number(amount.replace(',','.'))===Number(data.promoMinAmount)?'€'+amount+' or more':match);return text.replace(/(€\s*[0-9.,]+)(?=[A-Za-zÀ-ÿ])/g,'$1 ').replace(/([0-9.,]+)(?=AT CHECKOUT\b)/gi,'$1 ');}

function observeAnnouncementLayout() {
    const bar=document.getElementById('announcement-bar');
    if(!bar || bar.dataset.layoutObserved)return;
    bar.dataset.layoutObserved='true';
    const style=document.createElement('style');
    style.textContent='#announcement-bar{box-sizing:border-box;overflow-wrap:anywhere;white-space:normal;height:auto;line-height:1.5}#announcement-text{white-space:normal}#announcement-countdown{display:inline-block;white-space:nowrap;margin:2px 0 0 8px}#announcement-countdown.hidden{display:none}nav.announcement-active{top:var(--sayand-announcement-height,32px)!important}.hero-announcement{padding-top:calc(4rem + var(--sayand-announcement-height,32px))!important}@media(min-width:768px){.hero-announcement{padding-top:calc(5rem + var(--sayand-announcement-height,32px))!important}}';
    document.head.appendChild(style);
    const measure=()=>document.documentElement.style.setProperty('--sayand-announcement-height',bar.getBoundingClientRect().height+'px');
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(measure).observe(bar);
    window.addEventListener('resize',measure);measure();
}
function loadAnnouncement() {
    observeAnnouncementLayout();
    // Bar is permanent — no dismissal allowed
    if (typeof db !== 'undefined' && db.ref) {
        db.ref('mainStore/announcement').once('value').then(snap => {
            const data = snap.val();
            if (data && data.text && data.active) {
                const bar = document.getElementById('announcement-bar');
                const txt = document.getElementById('announcement-text');
                const countdownEl = document.getElementById('announcement-countdown');
                
                if (bar && txt) {
                    // Check if promo mode is active and not expired
                    let isPromoActive = false;
                    let promoExpired = false;
                    
                    if (data.isPromo && data.promoEndDate) {
                        const endDate = new Date(data.promoEndDate).getTime();
                        const now = new Date().getTime();
                        
                        if (now < endDate) {
                            isPromoActive = true;
                            // Start countdown
                            if (announcementCountdownInterval) clearInterval(announcementCountdownInterval);
                            
                            function updateCountdown() {
                                const currentNow = new Date().getTime();
                                const distance = endDate - currentNow;
                                
                                if (distance < 0) {
                                    clearInterval(announcementCountdownInterval);
                                    countdownEl.classList.add('hidden');
                                    txt.innerText = announcementText(data.text, data) + ' (EXPIRED)';
                                    promoExpired = true;
                                    // Hide bar after expiry
                                    setTimeout(() => {
                                        bar.classList.add('hidden');
                                        const nav = document.querySelector('nav');
                                        if (nav) nav.classList.remove('announcement-active');
                                        const hero = document.querySelector('section.relative.w-full.h-screen');
                                        if (hero) { hero.classList.remove('hero-announcement'); hero.style.paddingTop = ''; }
                                    }, 3000);
                                    return;
                                }
                                
                                const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                                
                                let timeStr = '';
                                if (days > 0) timeStr += days + 'd ';
                                timeStr += hours + 'h ' + minutes + 'm ' + seconds + 's';
                                
                                countdownEl.innerText = timeStr;
                                countdownEl.classList.remove('hidden');
                            }
                            
                            updateCountdown();
                            announcementCountdownInterval = setInterval(updateCountdown, 1000);
                            
                            // Update text with promo details
                            txt.innerText = announcementText(data.text, data);
                        } else {
                            // Promo expired
                            promoExpired = true;
                            txt.innerText = announcementText(data.text, data) + ' (ENDED)';
                        }
                    } else {
                        // Normal announcement
                        txt.innerText = announcementText(data.text, data);
                        countdownEl.classList.add('hidden');
                    }
                    
                    if (!promoExpired) {
                        bar.classList.remove('hidden');
                        const nav = document.querySelector('nav');
                        const hero = document.querySelector('section.relative.w-full.h-screen');
                        if (nav) nav.classList.add('announcement-active');
                        if (hero) hero.classList.add('hero-announcement');
                    }
                }
            }
        }).catch(() => {});
    }
}

// ==================== PROMO CODE VALIDATION (Usage Limits) ====================
window.validatePromoCode = function(code) {
    const data = window.SAYAND_PRODUCTS;
    if (!data) return { valid: false, reason: 'Store data not loaded' };
    
    const normalize = (entry) => {
        if (entry && typeof entry === 'object' && 'value' in entry) return entry;
        return { value: entry, maxUses: Infinity, uses: 0 };
    };
    
    if (data.discountCodes && data.discountCodes[code]) {
        const entry = normalize(data.discountCodes[code]);
        if (entry.uses >= entry.maxUses) return { valid: false, reason: 'Code usage limit reached', type: 'percent' };
        return { valid: true, type: 'percent', value: entry.value, code: code };
    }
    if (data.fixedCodes && data.fixedCodes[code]) {
        const entry = normalize(data.fixedCodes[code]);
        if (entry.uses >= entry.maxUses) return { valid: false, reason: 'Code usage limit reached', type: 'fixed' };
        return { valid: true, type: 'fixed', value: entry.value, code: code };
    }
    return { valid: false, reason: 'Invalid code' };
};

window.usePromoCode = async function() { return {success:false,error:'Promo redemption is confirmed only by the payment server.'}; };

// ─── ANNOUNCEMENT PROMO CALCULATOR ───
window.getActiveAnnouncementPromo = function() {
    const data = window.SAYAND_PRODUCTS;
    // Check if the store data exists and if a promo is currently active
    if (!data || !data.announcement || !data.announcement.active || !data.announcement.isPromo) return null;
    
    const now = new Date().getTime();
    const endDate = data.announcement.promoEndDate ? new Date(data.announcement.promoEndDate).getTime() : 0;
    
    // If the promo timer has expired, return null so it stops applying
    if (now > endDate) return null; 
    
    return {
        minAmount: parseFloat(data.announcement.promoMinAmount) || 0,
        percent: parseFloat(data.announcement.promoPercent) || 0
    };
};

window.calculateAnnouncementDiscount = function(subtotal) {
    const promo = window.getActiveAnnouncementPromo();
    if (!promo) return 0;
    if (subtotal < promo.minAmount) return 0;
    
    const discount = (subtotal * promo.percent) / 100;
    return Math.round(discount * 100) / 100; // Round to 2 decimals
};

// ==================== RECENTLY VIEWED ====================
window.saveRecentlyViewed = function(p) {
    if (!window.SayandConsent || !window.SayandConsent.allowed('personalization')) return;
    let rv = JSON.parse(localStorage.getItem('sayand_recently_viewed') || '[]');
    rv = rv.filter(item => item.name !== p.name);
    rv.unshift({
        name: p.name,
        translations: p.translations || {},
        price: p.price,
        img: p.images ? p.images[0] : p.img,
        category: p.category,
        salePrice: p.salePrice,
        originalPrice: p.originalPrice,
        isVipOnly: p.isVipOnly
    });
    if (rv.length > 6) rv = rv.slice(0, 6);
    localStorage.setItem('sayand_recently_viewed', JSON.stringify(rv));
};

window.renderRecentlyViewed = function() {
    const container = document.getElementById('recently-viewed-grid');
    const section = document.getElementById('recently-viewed-section');
    if (!container || !section) return;
    const items = window.SayandConsent && window.SayandConsent.allowed('personalization') ? JSON.parse(localStorage.getItem('sayand_recently_viewed') || '[]') : [];
    if (items.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    
    container.innerHTML = items.map(p => {
        const safeName = encodeURIComponent(p.name).replace(/'/g, '%27');

        // Look up live product data to verify current sale status and stock
        let liveProd = null;
        if (typeof SAYAND_PRODUCTS !== 'undefined' && SAYAND_PRODUCTS) {
            ['newArrivals', 'trending', 'sales', 'upcomingSales'].forEach(sec => {
                if (SAYAND_PRODUCTS[sec] && Array.isArray(SAYAND_PRODUCTS[sec])) {
                    const match = SAYAND_PRODUCTS[sec].find(prod => prod.name === p.name);
                    if (match) liveProd = match;
                }
            });
        }

        // --- NEW: OUT OF STOCK CHECK ---
        let checkProd = liveProd || p; // Fallback to local storage data if live not found
        let isTotalOOS = checkProd.isOutOfStock;
        
        if (!isTotalOOS) {
            let totalStock = 0;
            if (checkProd.sizeQuantities) {
                Object.values(checkProd.sizeQuantities).forEach(q => totalStock += parseInt(q));
            } else {
                totalStock = checkProd.quantity !== undefined ? parseInt(checkProd.quantity) : 1;
            }
            if (totalStock <= 0) isTotalOOS = true;
        }

        let oosHTML = '';
        let isLocked = checkProd.isVipOnly && !window.userIsVip; // Check VIP lock status
        
        // If out of stock and not VIP locked, apply the badge
        if (isTotalOOS && !isLocked) {
            oosHTML = `<div class="absolute inset-0 bg-[#f9f6f0]/70 z-10 flex items-center justify-center pointer-events-none border border-[#1a2e15]/20"><span class="bg-[#1a2e15] text-[#d4af37] border border-[#d4af37] text-[10px] tracking-widest px-3 py-1 font-black shadow-lg">SOLD OUT</span></div>`;
        }
        // -------------------------------

        // Only show sale if live data confirms it is still active
        const activeSale = liveProd ? isSaleActive(liveProd) : false;
        const priceToShow = activeSale ? liveProd.salePrice : (liveProd ? liveProd.price : p.price);
        const priceDisplay = formatPrice(priceToShow);
        const origDisplay = activeSale ? formatPrice(liveProd.originalPrice || liveProd.price) : '';

        return `
        <div class="flex-none w-64 md:w-72 snap-start group cursor-pointer" onclick="window.location.href=window.SayandSEO.productUrl(decodeURIComponent('${safeName}'))">
            <div class="relative w-full aspect-[4/5] overflow-hidden mb-3 bg-[#eef2ec]">
                <img src="${p.img}" alt="${sayandAlt(p.name)}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
                ${oosHTML}
            </div>
            <div class="flex flex-col items-start text-left w-full px-1">
                <h4 class="text-[11px] font-semibold tracking-wide uppercase mb-1 truncate w-full text-[#1a2e15] group-hover:text-[#d4af37] transition-colors">${SayandI18n.productHTML(p)}</h4>
                <div class="text-[11px] md:text-xs font-medium">
                    ${activeSale ? `<span class="text-[#6a7c64] line-through mr-2">${origDisplay}</span><span class="text-red-600 font-semibold">${priceDisplay}</span>` : `<span class="text-[#1a2e15]">${priceDisplay}</span>`}
                </div>
            </div>
        </div>`;
    }).join('');
};

// ==================== IMAGE ZOOM ====================
window.initImageZoom = function() {
    const container = document.getElementById('detail-image-container');
    const img = document.getElementById('detail-hero-img');
    if (!container || !img) return;
    container.addEventListener('mousemove', function(e) {
        if (window.innerWidth < 768) return;
        const { left, top, width, height } = container.getBoundingClientRect();
        const x = (e.clientX - left) / width;
        const y = (e.clientY - top) / height;
        img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
        img.style.transform = 'scale(2)';
    });
    container.addEventListener('mouseleave', function() {
        img.style.transformOrigin = 'center center';
        img.style.transform = 'scale(1)';
    });
};

// ==================== REFERRAL PROGRAM ====================
window.validateReferralCode = async function(code) {
    if (!code || code.length < 3) return { valid: false };
    try { return await SayandServices.call('validateReferral',{code}); } catch (_) {return {valid:false};}
};

// ==================== WHATSAPP FLOAT ====================
function initWhatsAppFloat() {
    const btn = document.getElementById('whatsapp-float');
    if (btn && CONTACT.whatsapp) {
        const num = CONTACT.whatsapp.replace(/\+/g, '').replace(/\s/g, '');
        btn.href = `https://wa.me/${num}?text=Hi%20SAYAND%2C%20I%20have%20a%20question%20about...`;
    }
}



function isSaleActive(product) {
    if (!product.salePrice) return false;
    if (product.saleEndDate) {
        const endDate = new Date(product.saleEndDate).getTime();
        const now = new Date().getTime();
        return now < endDate; 
    }
    return true; 
}

function getSalePercentage(product) {
    if (!isSaleActive(product)) return null;
    const original = parseFloat(product.originalPrice || product.price || 0);
    const sale = parseFloat(product.salePrice || 0);
    if (original <= 0 || sale <= 0 || sale >= original) return null;
    return Math.round(((original - sale) / original) * 100);
}

window.SayandPublicStore.on("value", (snapshot) => {
    const data = snapshot.val();
    if (data) {
        window.SAYAND_PRODUCTS = data;
        
        SayandI18n.registerCatalog(data);

        if (typeof updateContactInfo === 'function') updateContactInfo(data);
        if (typeof updateSiteContent === 'function') updateSiteContent(data);
        if (typeof renderAllProducts === 'function') renderAllProducts(data);
        if (typeof renderRecentlyViewed === 'function') renderRecentlyViewed();
        handleHashRoute(); 
    }
});

let CONTACT = { email: 'thesayand0@gmail.com', whatsapp: '+393299716798', instagram: 'https://instagram.com/thesayand_', tiktok: 'https://tiktok.com/@thesayand_', pinterest: 'https://pinterest.com/thesayand_' };

window.updateContactInfo = function(data) {
    if (data && data.contact) {
        CONTACT = data.contact;
        if(document.getElementById('contact-email')) {
            document.getElementById('contact-email').href = 'mailto:' + CONTACT.email;
            document.getElementById('contact-email').innerText = CONTACT.email;
            document.getElementById('contact-whatsapp').href = 'https://wa.me/' + CONTACT.whatsapp.replace(/\+/g,'');
            document.getElementById('contact-whatsapp').innerText = CONTACT.whatsapp;
            document.getElementById('contact-ig').href = CONTACT.instagram;
            document.getElementById('contact-ig').innerText = '@' + CONTACT.instagram.split('/').pop();
            document.getElementById('social-ig').href = CONTACT.instagram;
            document.getElementById('social-tk').href = CONTACT.tiktok;
            document.getElementById('social-pt').href = CONTACT.pinterest;
            const handle = CONTACT.instagram.split('/').pop() || 'thesayand_';
            document.getElementById('social-handle').innerText = '@' + handle;
            document.getElementById('contact-link').href = 'mailto:' + CONTACT.email;
        }
    }
};

window.showContact = function() { document.getElementById('contact-modal').style.display = 'flex'; };
window.closeContact = function() { document.getElementById('contact-modal').style.display = 'none'; };

function setMediaElement(elementId, url) {
    if (!url) return;
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const isVideo = url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov') || url.toLowerCase().includes('.webm');
    const parent = el.parentNode;

    if (isVideo) {
        let currentClass = el.className.replace('pointer-events-none', '').trim(); 
        if (!currentClass.includes('scale-105')) currentClass += ' scale-105';
        currentClass += ' pointer-events-auto cursor-pointer';

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<video id="${elementId}" class="${currentClass}" style="object-fit: cover; border-radius: 0px; background: transparent;" autoplay="autoplay" loop="loop" muted="muted" playsinline="playsinline" webkit-playsinline="webkit-playsinline" disablePictureInPicture="true" src="${url}"></video>`;
        const newEl = tempDiv.firstChild;
        
        newEl.muted = true;
        newEl.playsInline = true;
        newEl.autoplay = true;

        newEl.onclick = function(e) {
            e.preventDefault();
            newEl.muted = !newEl.muted;
        };

        parent.replaceChild(newEl, el);
        
        setTimeout(() => { 
            const playPromise = newEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => console.log("Autoplay blocked:", error));
            }
        }, 100);
    } else {
        let currentClass = el.className.replace('pointer-events-auto', '').replace('cursor-pointer', '').trim();
        if (!currentClass.includes('scale-105')) currentClass += ' scale-105';
        
        const newEl = document.createElement('img');
        newEl.id = elementId;
        newEl.className = currentClass;
        newEl.src = url;
        const mediaLabels = {womenImg:"SAYAND women's collection", menImg:"SAYAND men's collection", accImg:'SAYAND accessories collection', heroImage:'SAYAND featured collection', editImg:'SAYAND editorial collection', 'editorial-hero-img':'SAYAND editorial collection'};
        newEl.alt = el.getAttribute('alt') || mediaLabels[elementId] || 'SAYAND collection';
        parent.replaceChild(newEl, el);
    }
}

let editorialMediaList = [];
let currentEditorialIdx = 0;
let editTouchStartX = 0;
let editTouchEndX = 0;

window.editTouchStart = function(e) { editTouchStartX = e.changedTouches[0].screenX; editTouchEndX = editTouchStartX; }
window.editTouchMove = function(e) { editTouchEndX = e.changedTouches[0].screenX; }
window.editTouchEnd = function(e) {
    if (editorialMediaList.length <= 1) return;
    const diff = editTouchStartX - editTouchEndX;
    if (Math.abs(diff) > 40) { 
        if (diff > 0) currentEditorialIdx = (currentEditorialIdx + 1) % editorialMediaList.length;
        else currentEditorialIdx = (currentEditorialIdx - 1 + editorialMediaList.length) % editorialMediaList.length;
        renderEditorialSlide(currentEditorialIdx);
    }
}

// === INTERACTIVE HOTSPOT RENDERER REPLACES OLD SLIDE RENDERER ===
window.renderEditorialSlide = function(idx) {
    const url = editorialMediaList[idx];
    setMediaElement('editImg', url);
    setMediaElement('editorial-hero-img', url);
    
    const dotsContainer = document.getElementById('editorial-dots');
    if (dotsContainer) {
        if (editorialMediaList.length > 1) {
            dotsContainer.innerHTML = editorialMediaList.map((_, i) => `<span class="w-2 h-2 rounded-full shadow-sm transition-colors duration-300 ${i === idx ? 'bg-white' : 'bg-white/50'}"></span>`).join('');
        } else {
            dotsContainer.innerHTML = ''; 
        }
    }

    // Interactive Hotspot Renderer Logic
    let hotspotContainer = document.getElementById('editorial-hotspots');
    if(!hotspotContainer) {
        const heroImg = document.getElementById('editorial-hero-img');
        if(heroImg && heroImg.parentElement) {
            hotspotContainer = document.createElement('div');
            hotspotContainer.id = 'editorial-hotspots';
            hotspotContainer.className = 'absolute inset-0 z-40 pointer-events-none';
            heroImg.parentElement.appendChild(hotspotContainer);
        }
    }
    
    if(hotspotContainer) {
        hotspotContainer.innerHTML = '';
        const sc = window.SAYAND_PRODUCTS?.siteContent;
        
        if(sc && sc.hotspots && sc.hotspots[url]) {
            sc.hotspots[url].forEach(spot => {
                let foundProduct = null;
                ['newArrivals', 'trending', 'upcomingSales'].forEach(sec => {
                    if(window.SAYAND_PRODUCTS[sec]) {
                        const match = window.SAYAND_PRODUCTS[sec].find(p => p.name === spot.product);
                        if(match) foundProduct = match;
                    }
                });

             if(foundProduct) {
                    const safeName = encodeURIComponent(foundProduct.name).replace(/'/g, '%27');
                    const activeSale = isSaleActive(foundProduct);
                    const displayPrice = activeSale ? foundProduct.salePrice : foundProduct.price;
                    
                    const spotHTML = `
                        <div class="absolute w-6 h-6 -ml-3 -mt-3 group pointer-events-auto cursor-pointer flex items-center justify-center" style="left: ${spot.x}%; top: ${spot.y}%;" onclick="window.location.href=window.SayandSEO.productUrl(decodeURIComponent('${safeName}'))">
                            <div class="absolute w-full h-full bg-white/60 rounded-full animate-ping"></div>
                            <div class="relative w-2 h-2 bg-white rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)] border border-gray-200"></div>
                            
                            <div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 bg-[#f9f6f0]/95 backdrop-blur-sm text-[#1a2e15] text-[9px] tracking-widest font-bold px-4 py-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 whitespace-nowrap shadow-2xl border border-[#d4af37]/30 pointer-events-none flex items-center gap-3 z-50">
                                <span>${spot.product}</span>
                                <span class="text-[#6a7c64] font-medium">€${displayPrice}</span>
                            </div>
                        </div>
                    `;
                    hotspotContainer.innerHTML += spotHTML;
                }
            });
        }
    }
}

window.updateSiteContent = function(data) {
    if (data && data.siteContent) {
        const sc = data.siteContent;
        if(sc.heroImg) setMediaElement('heroImage', sc.heroImg);
        if(sc.womenImg) setMediaElement('womenImg', sc.womenImg);
        if(sc.menImg) setMediaElement('menImg', sc.menImg);
        if(sc.accImg) setMediaElement('accImg', sc.accImg);
        
        if(sc.editImg) {
            if (sc.editImg.includes(',')) editorialMediaList = sc.editImg.split(',').map(s => s.trim());
            else editorialMediaList = [sc.editImg];
            currentEditorialIdx = 0;
            renderEditorialSlide(currentEditorialIdx);
            setMediaElement('editorial-hero-img', editorialMediaList[0]);
        }
        
        for (const field of ['heroSubtitle','heroTitle','editSubtitle','editTitle','editDesc']) {
            if (!sc[field]) continue;
            const isHTML = field === 'heroTitle' || field === 'editTitle';
            SayandI18n.bind(document.getElementById(field), sc[field], SayandI18n.fieldTranslations(sc, field), isHTML);
        }
    }
};

window.renderAllProducts = function(data) {
    const newArrivalsGrid = document.getElementById('new-arrivals-grid');
    const trendingGrid = document.getElementById('trending-grid');
    if(!newArrivalsGrid || !trendingGrid) return;
    
    newArrivalsGrid.innerHTML = '';
    trendingGrid.innerHTML = '';

    if (data.newArrivals) {
        data.newArrivals.forEach(p => {
            const el = document.createElement('div');
            el.className = 'flex-none w-72 md:w-80 snap-start group cursor-pointer';
            el.innerHTML = createProductCardHTML(p, true);
            newArrivalsGrid.appendChild(el);
        });
    }
    if (data.trending) {
        data.trending.forEach(p => {
            const el = document.createElement('div');
            el.className = 'group cursor-pointer';
            el.innerHTML = createProductCardHTML(p, false);
            trendingGrid.appendChild(el);
        });
    }
};

const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');
let menuOpen = false;
function toggleMenu() {
    menuOpen = !menuOpen; mobileMenu.classList.toggle('active');
    const spans = menuBtn.querySelectorAll('span');
    spans[0].style.transform = menuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none';
    spans[1].style.transform = menuOpen ? 'rotate(-45deg)' : 'none';
}
menuBtn.addEventListener('click', toggleMenu);

const scrollContainer = document.getElementById('new-arrivals-grid');
const scrollLeft = document.getElementById('scrollLeft');
const scrollRight = document.getElementById('scrollRight');
if(scrollLeft && scrollRight) {
    scrollLeft.addEventListener('click', () => scrollContainer.scrollBy({ left: -320, behavior: 'smooth' }));
    scrollRight.addEventListener('click', () => scrollContainer.scrollBy({ left: 320, behavior: 'smooth' }));
}

window.hoverCard = function(el) {
    const images = JSON.parse(el.dataset.images);
    if (images.length > 1 && el.dataset.currentIndex === "0") el.querySelector('.main-img').src = images[1]; 
}
window.unhoverCard = function(el) {
    const images = JSON.parse(el.dataset.images);
    if (el.dataset.currentIndex === "0") el.querySelector('.main-img').src = images[0]; 
}
window.updateDots = function(card, idx) {
    const dots = card.querySelectorAll('.dots-container span');
    dots.forEach((dot, i) => { dot.className = i === idx ? 'w-1.5 h-1.5 rounded-full bg-[#1a2e15] shadow-sm' : 'w-1.5 h-1.5 rounded-full bg-[#c2c9c0] shadow-sm'; });
}
window.nextCardImg = function(e, btn) {
    e.stopPropagation(); e.preventDefault();
    const card = btn.closest('.product-card');
    const images = JSON.parse(card.dataset.images);
    let idx = parseInt(card.dataset.currentIndex);
    idx = (idx + 1) % images.length;
    card.dataset.currentIndex = idx.toString();
    card.querySelector('.main-img').src = images[idx];
    updateDots(card, idx);
}
window.prevCardImg = function(e, btn) {
    e.stopPropagation(); e.preventDefault();
    const card = btn.closest('.product-card');
    const images = JSON.parse(card.dataset.images);
    let idx = parseInt(card.dataset.currentIndex);
    idx = (idx - 1 + images.length) % images.length;
    card.dataset.currentIndex = idx.toString();
    card.querySelector('.main-img').src = images[idx];
    updateDots(card, idx);
}

// Global click handler for Locked VIP products
window.handleVipClick = function(e) {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    if (typeof showToast === 'function') {
        showToast("LOCKED: ATELIER VIP EXCLUSIVE");
    } else {
        alert("This piece is strictly reserved for SAYAND ATELIER VIP members. Elevate your status by shopping the public collection.");
    }
}

// 🟢 ALL COLORS UPDATED IN HTML TEMPLATE LITERALS
function createProductCardHTML(p, isNewArrival = false) {
    const imgArray = p.images ? p.images : (p.img ? [p.img] : []);
    const imgArrayStr = JSON.stringify(imgArray).replace(/"/g, '&quot;');
    const safeName = encodeURIComponent(p.name).replace(/'/g, '%27');
    const activeSale = isSaleActive(p);
    
    // SAFELY EXTRACT IMAGE URL OR USE TRANSPARENT PIXEL FALLBACK
    let safeImgSrc = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    if (imgArray.length > 0 && imgArray[0]) {
        safeImgSrc = imgArray[0];
    }
    
    // VIP LOCK LOGIC
    let isLocked = p.isVipOnly && !window.userIsVip;
    let clickAction = isLocked ? `handleVipClick(event)` : `window.location.href=window.SayandSEO.productUrl(decodeURIComponent('${safeName}'))`;

    let carouselHTML = '';
    if (imgArray.length > 1) {
        carouselHTML = `
            <button onclick="prevCardImg(event, this)" class="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-[#f9f6f0]/90 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity z-20 text-[#1a2e15] border border-[#c2c9c0] shadow-md hover:bg-[#1a2e15] hover:border-[#1a2e15] hover:text-[#d4af37] text-xs">&larr;</button>
            <button onclick="nextCardImg(event, this)" class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-[#f9f6f0]/90 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity z-20 text-[#1a2e15] border border-[#c2c9c0] shadow-md hover:bg-[#1a2e15] hover:border-[#1a2e15] hover:text-[#d4af37] text-xs">&rarr;</button>
            <div class="absolute bottom-[1rem] left-0 right-0 flex justify-center gap-1.5 z-20 opacity-0 group-hover/card:opacity-100 transition-opacity dots-container pointer-events-none">
                ${imgArray.map((_, i) => `<span class="w-1.5 h-1.5 rounded-full ${i===0 ? 'bg-[#1a2e15]' : 'bg-[#c2c9c0]'} shadow-sm"></span>`).join('')}
            </div>`;
    }
    
    let badgeHTML = '';
    if (activeSale && !isLocked) {
        const salePct = getSalePercentage(p);
        const pctText = salePct ? `-${salePct}%` : 'ON SALE';
        badgeHTML = `<div class="absolute top-2 left-2 bg-red-600 text-white text-[9px] tracking-widest px-2 py-1 font-black">${pctText}</div>`;
    } else if (isNewArrival && !isLocked && !p.isVipOnly) {
        badgeHTML = `<div class="absolute top-2 right-2 bg-[#1a2e15] text-[#d4af37] border border-[#d4af37] text-[9px] tracking-widest px-2 py-1 font-black shadow-lg z-20">NEW</div>`;
    }

    let lockHTML = '';
    if (p.isVipOnly) {
        if (isLocked) {
            lockHTML = `
            <div class="absolute inset-0 bg-[#1a2e15]/70 backdrop-blur-[2px] z-[15] flex flex-col items-center justify-center pointer-events-none transition-all border border-[#d4af37]/30">
                <div class="bg-[#2c4c23] p-3 rounded-full border border-[#d4af37]/50 shadow-2xl mb-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <span class="bg-[#1a2e15] text-[#d4af37] text-[8px] tracking-[0.2em] px-3 py-1 font-black border border-[#d4af37]">VIP LOCKED</span>
            </div>`;
        } else {
            lockHTML = `<div class="absolute top-2 left-2 bg-[#1a2e15] text-[#d4af37] text-[8px] tracking-[0.2em] px-2 py-1 z-20 border border-[#d4af37] shadow-lg font-black">VIP EXCLUSIVE</div>`;
        }
    }

    let priceHTML = '';
    if (isLocked) {
        priceHTML = `<span class="text-[#6a7c64] italic font-medium">VIP Only</span>`;
    } else if (activeSale) {
        priceHTML = `<span class="text-[11px] md:text-xs text-[#6a7c64] line-through mr-2 font-medium">${formatPrice(p.originalPrice || p.price)}</span><span class="text-[11px] md:text-xs font-semibold text-red-600">${formatPrice(p.salePrice)}</span>`;
    } else {
        priceHTML = formatPrice(p.price);
    }

    let isTotalOOS = p.isOutOfStock;
    if (!isTotalOOS) {
        let totalStock = 0;
        if(p.sizeQuantities) {
            Object.values(p.sizeQuantities).forEach(q => totalStock += parseInt(q));
        } else {
            totalStock = p.quantity !== undefined ? parseInt(p.quantity) : 1;
        }
        if(totalStock <= 0) isTotalOOS = true;
    }

    let oosHTML = '';
    if (isTotalOOS && !isLocked) {
        oosHTML = `<div class="absolute inset-0 bg-[#f9f6f0]/70 z-10 flex items-center justify-center pointer-events-none border border-[#1a2e15]/20"><span class="bg-[#1a2e15] text-[#d4af37] border border-[#d4af37] text-[10px] tracking-widest px-3 py-1 font-black shadow-lg">SOLD OUT</span></div>`;
    }

    return `
        <div class="product-card flex flex-col relative w-full group/card transition-all cursor-pointer" data-images="${imgArrayStr}" data-current-index="0" onmouseenter="${isLocked ? '' : 'hoverCard(this)'}" onmouseleave="${isLocked ? '' : 'unhoverCard(this)'}" onclick="${clickAction}">
            <div class="relative w-full aspect-[4/5] overflow-hidden mb-3 bg-[#eef2ec]">
                <img src="${safeImgSrc}" alt="${sayandAlt(p.name)}" class="main-img w-full h-full object-cover transition-transform duration-700 ${isLocked ? '' : 'group-hover/card:scale-105'}">
                ${oosHTML}
                ${lockHTML}
                ${carouselHTML}
                ${badgeHTML}
            </div>
            <div class="flex flex-col items-start text-left w-full px-1">
                <h4 class="text-[11px] md:text-xs font-semibold tracking-wide uppercase mb-1 truncate w-full ${isLocked ? 'text-[#6a7c64]' : 'text-[#1a2e15] group-hover/card:text-[#d4af37] transition-colors'}">${SayandI18n.productHTML(p)}</h4>
                <div class="text-[11px] md:text-xs ${activeSale && !isLocked ? '' : 'text-[#1a2e15] font-medium'}">${priceHTML}</div>
            </div>
        </div>`;
}

let currentDetailProduct = null;
let currentDetailSize = '';
let currentDetailColor = '';
let currentDetailImageIdx = 0;
let countdownInterval = null;
let wishlist = JSON.parse(localStorage.getItem('sayand_wishlist') || '[]');
let currentNotifySize = '';

function loadWishlistFromFirebase() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    firebase.database().ref(`users/${user.uid}/wishlist`).once('value').then(snap => {
        const val = snap.val();
        if (val && Array.isArray(val) && val.length > 0) {
            wishlist = val;
            localStorage.setItem('sayand_wishlist', JSON.stringify(wishlist));
        } else if (wishlist.length > 0) {
            // Guest wishlist exists but Firebase is empty — push it up
            firebase.database().ref(`users/${user.uid}/wishlist`).set(wishlist);
        }
        updateWishlistCount();
        renderWishlist();
    }).catch(err => console.error('Wishlist sync error:', err));
}
let touchStartX = 0;
let touchEndX = 0;
window.touchStart = function(e) { touchStartX = e.changedTouches[0].screenX; }
window.touchMove = function(e) { touchEndX = e.changedTouches[0].screenX; }
window.touchEnd = function(e) {
    const imgArray = currentDetailProduct ? (currentDetailProduct.images || [currentDetailProduct.img]) : [];
    if (imgArray.length <= 1) return;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
        if (diff > 0) {
            currentDetailImageIdx = (currentDetailImageIdx + 1) % imgArray.length;
        } else {
            currentDetailImageIdx = (currentDetailImageIdx - 1 + imgArray.length) % imgArray.length;
        }
        setDetailImage(currentDetailImageIdx);
    }
}

window.updateProductStockUI = function() {
    if(!currentDetailProduct) return;

    const qtyInput = document.getElementById('customer-qty');
    const addBtn = document.getElementById('detail-add-btn');
    const stockEl = document.getElementById('detail-stock');

    if (currentDetailProduct.isPreorder) {
        stockEl.innerText = 'PRE-ORDER AVAILABLE';
        stockEl.style.color = '#d4af37'; 
        
        addBtn.innerText = 'PRE-ORDER NOW';
        addBtn.disabled = false;
        addBtn.className = "w-full bg-[#1a2e15] border border-[#d4af37] text-[#d4af37] py-4 text-xs tracking-[0.2em] font-black transition-all duration-300 mb-8 hover:bg-[#2c4c23] shadow-lg";
        
        if(qtyInput) {
            qtyInput.disabled = false;
            qtyInput.max = 99; 
            qtyInput.value = 1;
        }
        return;
    }

    addBtn.className = "w-full bg-[#1a2e15] border border-[#d4af37] text-[#d4af37] py-4 text-xs tracking-[0.2em] font-black hover:bg-[#2c4c23] transition-all duration-300 mb-8 shadow-lg";

    let sizeQty = 0;
    if (currentDetailProduct.sizeQuantities && currentDetailProduct.sizeQuantities[currentDetailSize] !== undefined) {
        sizeQty = parseInt(currentDetailProduct.sizeQuantities[currentDetailSize]);
    } else {
        sizeQty = currentDetailProduct.quantity !== undefined ? parseInt(currentDetailProduct.quantity) : 1;
    }

    const isOOS = currentDetailProduct.isOutOfStock || sizeQty <= 0;

    if (isOOS) {
        stockEl.innerText = 'OUT OF STOCK';
        stockEl.style.color = '#dc2626'; 
        addBtn.innerText = 'NOTIFY ME WHEN IN STOCK';
        addBtn.disabled = false;
        addBtn.className = "w-full bg-[#1a2e15] border border-[#d4af37] text-[#d4af37] py-4 text-xs tracking-[0.2em] font-black hover:bg-[#2c4c23] transition-all duration-300 mb-8 shadow-lg";
        if(qtyInput) { qtyInput.disabled = true; qtyInput.value = 0; }
    } else {
        stockEl.innerText = sizeQty + ' IN STOCK';
        stockEl.style.color = '#6a7c64'; 
        addBtn.innerText = 'ADD TO BAG';
        addBtn.disabled = false;
        if(qtyInput) {
            qtyInput.disabled = false;
            qtyInput.max = sizeQty;
            qtyInput.value = 1;
        }
    }
}

window.openProductDetail = function(encodedProd) {
    const p = JSON.parse(decodeURIComponent(encodedProd));
    
    // Core Render Function
    const renderProduct = () => {
        // SECURITY KICK: If VIP Locked and user isn't VIP
        if (p.isVipOnly && !window.userIsVip) {
            document.body.innerHTML = `
                <nav class="fixed top-0 left-0 w-full z-[99] bg-[#1a2e15] border-b border-[#d4af37]/30 px-6 py-4 flex justify-between items-center shadow-md">
                    <a href="index.html" class="text-xl font-black tracking-tighter hover:opacity-70 transition-opacity text-[#d4af37]">SAYAND</a>
                </nav>
                <div class="min-h-screen flex flex-col items-center justify-center bg-[#f9f6f0] text-center p-6 pt-24">
                    <div class="bg-[#1a2e15] p-5 rounded-full border border-[#d4af37] shadow-2xl mb-6">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <h1 class="text-2xl font-black tracking-[0.1em] mb-4 uppercase text-[#1a2e15]">Private Atelier Drop</h1>
                    <p class="text-[#6a7c64] text-sm max-w-md mb-8 leading-relaxed font-bold">This piece is strictly reserved for SAYAND ATELIER VIP members. Elevate your status by shopping the public collection.</p>
                    <a href="index.html" class="bg-[#1a2e15] text-[#d4af37] border border-[#d4af37] px-8 py-4 text-[10px] font-black tracking-widest transition-colors hover:bg-[#2c4c23] shadow-lg">RETURN TO STORE</a>
                </div>
            `;
            return;
        }

        currentDetailProduct = p;
        saveRecentlyViewed(p);
        currentDetailImageIdx = 0;
        clearInterval(countdownInterval); 
        
        const imgArray = p.images ? p.images : (p.img ? [p.img] : []);
        const activeSale = isSaleActive(p);
        
        document.getElementById('detail-hero-img').src = imgArray[0];
        document.getElementById('detail-hero-img').alt = p.name + ' — view 1';
        window.SayandAnalytics?.shopping('view_item', [{...p, quantity: 1, price: activeSale ? p.salePrice : p.price}]);
        
        const thumbsContainer = document.getElementById('detail-thumbs');
        thumbsContainer.innerHTML = imgArray.map((img, i) => `
            <button onclick="setDetailImage(${i})" class="flex-shrink-0 w-16 h-20 border-2 bg-[#eef2ec] ${i === 0 ? 'border-[#d4af37]' : 'border-transparent'} overflow-hidden transition-all">
                <img src="${img}" alt="${sayandAlt(p.name)} — view ${i + 1}" class="w-full h-full object-cover">
            </button>`).join('');
        
        const dotsContainer = document.getElementById('detail-dots');
        if (imgArray.length > 1) {
            dotsContainer.innerHTML = imgArray.map((_, i) => `
                <button onclick="setDetailImage(${i})" class="w-2 h-2 rounded-full transition-all border border-[#1a2e15]/20 ${i === 0 ? 'bg-[#d4af37]' : 'bg-[#c2c9c0]'}"></button>
            `).join('');
            document.getElementById('swipe-hint').style.display = 'block';
        } else {
            dotsContainer.innerHTML = '';
            document.getElementById('swipe-hint').style.display = 'none';
        }
        
        SayandI18n.bindProduct(document.getElementById('detail-name'), p, 'name');
        
        const priceEl = document.getElementById('detail-price');
        const origPriceEl = document.getElementById('detail-original-price');
        const countdownContainer = document.getElementById('sale-countdown-container');
        const countdownSpan = document.getElementById('sale-countdown');
        
        if (activeSale) {
            const salePct = getSalePercentage(p);
            priceEl.innerHTML = formatPrice(p.salePrice) + (salePct ? ` <span class="text-red-600 text-sm font-black ml-1">-${salePct}%</span>` : '');
            priceEl.classList.add('text-red-600');
            origPriceEl.innerText = formatPrice(p.originalPrice || p.price);
            origPriceEl.classList.remove('hidden');

            if (p.saleEndDate) {
                countdownContainer.classList.remove('hidden');
                const endDate = new Date(p.saleEndDate).getTime();
                
                countdownInterval = setInterval(() => {
                    const now = new Date().getTime();
                    const distance = endDate - now;
                    
                    if (distance < 0) {
                        clearInterval(countdownInterval);
                        countdownContainer.classList.add('hidden');
                        priceEl.innerText = formatPrice(p.price);
                        priceEl.classList.remove('text-red-600');
                        origPriceEl.classList.add('hidden');
                        currentDetailProduct.salePrice = null; 
                    } else {
                        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                        countdownSpan.innerText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
                    }
                }, 1000);
            } else {
                countdownContainer.classList.add('hidden'); 
            }
        } else {
            priceEl.innerText = formatPrice(p.price);
            priceEl.classList.remove('text-red-600');
            origPriceEl.classList.add('hidden');
            countdownContainer.classList.add('hidden');
        }
        
        const sku = p.name.substring(0,3).toUpperCase() + Math.floor(1000+Math.random()*8999) + '/' + Math.floor(100+Math.random()*899) + '/' + Math.floor(100+Math.random()*899);
        document.getElementById('detail-sku').innerText = sku;
        
        const colors = p.colors && p.colors.length ? p.colors : ['Default'];
        currentDetailColor = colors[0];
        document.getElementById('detail-color').innerText = currentDetailColor.toUpperCase();
        
        // === AUTO-SIZING LOGIC INJECTION ===
        const sizes = p.sizes && p.sizes.length ? p.sizes : ['OS'];
        
        let recommendedSize = null;
        if (window.userFitPrefs && p.category) {
            const cat = p.category.toLowerCase();
            const pName = p.name.toLowerCase();
            if (cat.includes('coat') || cat.includes('outerwear') || pName.includes('coat') || pName.includes('jacket')) {
                recommendedSize = window.userFitPrefs.tops; // Using top sizing for coats
            } else if (cat.includes('women') || cat.includes('men') || cat.includes('top') || pName.includes('shirt')) {
                recommendedSize = window.userFitPrefs.tops;
            } else if (cat.includes('bottom') || cat.includes('pant') || pName.includes('pant') || pName.includes('trouser') || pName.includes('denim')) {
                recommendedSize = window.userFitPrefs.bottoms;
            } else if (cat.includes('shoe') || pName.includes('shoe') || pName.includes('boot') || pName.includes('sneaker')) {
                recommendedSize = window.userFitPrefs.shoes;
            }
        }

        currentDetailSize = sizes[0]; 
        for(let s of sizes) {
            let q = p.sizeQuantities ? parseInt(p.sizeQuantities[s] || 0) : parseInt(p.quantity||1);
            if(q > 0) { currentDetailSize = s; break; }
        }

        // Override with recommended size if available and in stock
        if (recommendedSize && sizes.includes(recommendedSize)) {
            let q = p.sizeQuantities ? parseInt(p.sizeQuantities[recommendedSize] || 0) : parseInt(p.quantity||1);
            if (q > 0 || p.isPreorder) {
                currentDetailSize = recommendedSize;
                setTimeout(() => { if (typeof showToast === 'function') showToast("YOUR FIT PROFILE APPLIED"); }, 600);
            }
        }
        // === END AUTO-SIZING ===

        renderDetailSizes(sizes);
        updateProductStockUI();
        
        SayandI18n.bindProduct(document.getElementById('detail-description'), p, 'description', 'Premium quality fashion piece from SAYAND.');
        renderDetailDetails(p);
        renderDetailMeasurements(p);
        
        const modelImg = document.getElementById('detail-model-img');
        if(modelImg) modelImg.alt = p.name + ' — additional view';
        if (imgArray.length > 1) { modelImg.src = imgArray[1]; modelImg.style.display = 'block'; }
        else { modelImg.style.display = 'none'; }
        
        renderRelatedProducts(p);
        switchDetailTab('description');

        // Initialize image zoom for desktop
        setTimeout(() => initImageZoom(), 100);
        
        const heartBtn = document.getElementById('detail-heart');
        const isLiked = wishlist.some(w => w.name === p.name);
        heartBtn.classList.toggle('text-[#d4af37]', isLiked);
        heartBtn.classList.toggle('text-[#1a2e15]', !isLiked);
        
        document.getElementById('detail-share-menu').classList.remove('open');
        document.getElementById('product-detail').style.transform = 'translateY(0)';
        document.body.style.overflow = 'hidden';
        
        const detailScroll = document.getElementById('detail-scroll');
        if (detailScroll) detailScroll.scrollTop = 0;
        window.scrollTo(0, 0);
        setTimeout(() => {
            if (detailScroll) detailScroll.scrollTo({ top: 0, behavior: 'smooth' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
    };

    // GUARD: Wait for Firebase Auth to settle before checking VIP status
    if (p.isVipOnly) {
        let attempts = 0;
        const check = setInterval(() => {
            if (window.authSettled || attempts > 20) { // Max wait 2 seconds
                clearInterval(check);
                renderProduct();
            }
            attempts++;
        }, 100);
    } else {
        renderProduct();
    }
};

window.closeProductDetail = function() {
    clearInterval(countdownInterval);
    document.getElementById('product-detail').style.transform = 'translateY(100%)';
    document.getElementById('detail-share-menu').classList.remove('open');
    if(document.getElementById('cart-overlay') && document.getElementById('cart-overlay').classList.contains('hidden')) {
        document.body.style.overflow = '';
    }
};

window.setDetailImage = function(idx) {
    const imgArray = currentDetailProduct ? (currentDetailProduct.images || [currentDetailProduct.img]) : [];
    currentDetailImageIdx = idx;
    document.getElementById('detail-hero-img').src = imgArray[idx];
    document.getElementById('detail-hero-img').alt = currentDetailProduct.name + ' — view ' + (idx + 1);
    
    const thumbs = document.getElementById('detail-thumbs').children;
    for (let i = 0; i < thumbs.length; i++) {
        thumbs[i].className = `flex-shrink-0 w-16 h-20 border-2 bg-[#eef2ec] ${i === idx ? 'border-[#d4af37]' : 'border-transparent'} overflow-hidden transition-all`;
    }
    const dots = document.getElementById('detail-dots').children;
    for (let i = 0; i < dots.length; i++) {
        dots[i].className = `w-2 h-2 rounded-full transition-all border border-[#1a2e15]/20 ${i === idx ? 'bg-[#d4af37]' : 'bg-[#c2c9c0]'}`;
    }
};

window.renderDetailSizes = function(sizes) {
    const container = document.getElementById('detail-sizes');
    const p = currentDetailProduct;
    
    container.innerHTML = sizes.map((s, i) => {
        let qty = 0;
        let isSizeOOS = false;
        
        if (!p.isPreorder) {
            if (p.sizeQuantities && p.sizeQuantities[s] !== undefined) {
                qty = parseInt(p.sizeQuantities[s]);
            } else {
                qty = p.quantity !== undefined ? parseInt(p.quantity) : 1;
            }
            isSizeOOS = p.isOutOfStock || qty <= 0;
        }

        const disabledClass = isSizeOOS ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer border hover:border-[#1a2e15]';
        const clickFunc = isSizeOOS ? '' : `onclick="currentDetailSize='${s}'; renderDetailSizes(${JSON.stringify(sizes).replace(/"/g,"'")}); updateProductStockUI();"`;

        let stockText = '';
        if (isSizeOOS) stockText = 'Out of Stock';
        else if (!p.isPreorder && qty < 5) stockText = 'Few left';

        const isSelected = currentDetailSize === s;
        let boxStyle = isSelected ? 'border-[#d4af37] bg-white' : 'border-[#c2c9c0] bg-transparent';
        let textClass = isSelected ? 'text-[#1a2e15] font-black' : 'text-[#6a7c64] font-medium';

        return `
            <div class="text-center px-4 py-2 transition-all ${boxStyle} ${disabledClass}" ${clickFunc}>
                <div class="text-sm ${textClass}">${s}</div>
                ${stockText ? `<div class="text-[9px] font-bold tracking-widest mt-1 ${isSizeOOS?'text-red-500':'text-[#d4af37]'} uppercase">${stockText}</div>` : ''}
            </div>`;
    }).join('');
};

window.renderDetailDetails = function(p) {
    const container = document.getElementById('detail-details-list');
    const details = p.details || {Material: 'Premium fabric blend', Fit: 'Regular', Care: 'Follow label instructions', Origin: 'Imported'};
    container.innerHTML = Object.entries(details).map(([key, value]) => `
        <div class="flex justify-between py-3 border-b border-[#c2c9c0]/50">
            <span class="text-[#2c4c23] text-[10px] font-black tracking-widest uppercase">${key}</span>
            <span class="text-[#1a2e15] text-xs font-bold">${SayandI18n.productHTML(p, 'details.' + key, value)}</span>
        </div>`).join('');
};

window.renderDetailMeasurements = function(p) {
    const container = document.getElementById('detail-measurements-list');
    const measurements = p.measurements || {OS: {Chest: '98cm', Length: '70cm'}};
    container.innerHTML = Object.entries(measurements).map(([size, vals]) => `
        <div>
            <div class="text-[10px] font-black text-[#d4af37] mb-2 tracking-widest uppercase">SIZE ${size}</div>
            <div class="space-y-1">
                ${Object.entries(vals).map(([k, v]) => `<div class="flex justify-between py-1 border-b border-[#c2c9c0]/30 last:border-0"><span class="text-[#6a7c64] text-[10px] font-bold uppercase tracking-widest">${k}</span><span class="text-[#1a2e15] text-xs font-black">${v}</span></div>`).join('')}
            </div>
        </div>`).join('');
};

window.switchDetailTab = function(tab) {
    document.querySelectorAll('.detail-tab').forEach(t => { t.classList.toggle('active', t.dataset.tab === tab); });
    document.querySelectorAll('.detail-tab-content').forEach(c => { c.classList.toggle('hidden', c.id !== `tab-${tab}`); });
    const activeContent = document.getElementById(`tab-${tab}`);
    if (activeContent) {
        activeContent.classList.remove('detail-content-enter');
        void activeContent.offsetWidth;
        activeContent.classList.add('detail-content-enter');
    }
};

window.toggleAccordion = function(header) {
    const body = header.nextElementSibling;
    const icon = header.querySelector('.accordion-icon');
    body.classList.toggle('open');
    if (body.classList.contains('open')) {
        icon.innerText = '-';
    } else {
        icon.innerText = '+';
    }
};

// 🟢 RESTYLED: Edge-to-edge layout for the related items
window.renderRelatedProducts = function(currentP) {
    const relatedContainer = document.getElementById('detail-related');
    const interestedContainer = document.getElementById('detail-interested');
    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
        if (SAYAND_PRODUCTS.sales) allProducts = allProducts.concat(SAYAND_PRODUCTS.sales);
        allProducts=allProducts.filter((p,i,list)=>list.findIndex(x=>x.name===p.name)===i);
        if (SAYAND_PRODUCTS.sales) allProducts = allProducts.concat(SAYAND_PRODUCTS.sales);
    }
    let related = [];
    if (currentP.related && currentP.related.length > 0) {
        related = allProducts.filter(p => currentP.related.includes(p.name) && p.name !== currentP.name).slice(0, 3);
    }
    if (related.length < 3) {
        const byCategory = allProducts.filter(p => p.name !== currentP.name && p.category === currentP.category && !related.includes(p)).slice(0, 3 - related.length);
        related = related.concat(byCategory);
    }
    while (related.length < 3) {
        const random = allProducts.find(p => !related.includes(p) && p.name !== currentP.name);
        if (random) related.push(random); else break;
    }
    
    const createMiniCard = (p) => {
        const img = p.images ? p.images[0] : p.img;
        const safeName = encodeURIComponent(p.name).replace(/'/g, '%27');
        return `<div class="cursor-pointer flex flex-col group w-full" onclick="window.location.href=window.SayandSEO.productUrl(decodeURIComponent('${safeName}'))">
            <div class="w-full aspect-[4/5] bg-[#eef2ec] overflow-hidden mb-3 relative">
                <img src="${img}" alt="${sayandAlt(p.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="flex flex-col items-start text-left w-full">
                <p class="text-[11px] font-semibold tracking-wide text-[#1a2e15] truncate uppercase w-full group-hover:text-[#d4af37] transition-colors mb-1">${SayandI18n.productHTML(p)}</p>
                <p class="text-[11px] text-[#1a2e15] font-medium">${formatPrice(isSaleActive(p) ? p.salePrice : p.price)}</p>
            </div>
        </div>`;
    };
    
    if (relatedContainer) relatedContainer.innerHTML = related.map(createMiniCard).join('') || '<p class="text-xs text-[#6a7c64] font-medium col-span-3">No related items</p>';
    
    const interested = allProducts.filter(p => p.name !== currentP.name && p.category !== currentP.category).slice(0, 3);
    if (interestedContainer) interestedContainer.innerHTML = interested.map(createMiniCard).join('') || '<p class="text-xs text-[#6a7c64] font-medium col-span-3">No recommendations</p>';
};

function saveWishlist() {
    localStorage.setItem('sayand_wishlist', JSON.stringify(wishlist));
    updateWishlistCount();
    renderWishlist();
    const user = firebase.auth().currentUser;
    if (user) {
        firebase.database().ref(`users/${user.uid}/wishlist`).set(wishlist).catch(err => console.error('Wishlist save error:', err));
    }
}
function updateWishlistCount() {
    const count = document.getElementById('wishlist-count');
    if (count) {
        count.innerText = wishlist.length;
        count.classList.toggle('hidden', wishlist.length === 0);
    }
}
window.toggleWishlistCurrent = function() {
    if (!currentDetailProduct) return;
    const idx = wishlist.findIndex(w => w.name === currentDetailProduct.name);
    const heartBtn = document.getElementById('detail-heart');
    if (idx >= 0) {
        wishlist.splice(idx, 1);
        if(heartBtn) {
            heartBtn.classList.remove('text-[#d4af37]');
            heartBtn.classList.add('text-[#1a2e15]');
        }
        showToast('REMOVED FROM SAVED');
    } else {
        wishlist.push({name: currentDetailProduct.name, translations: currentDetailProduct.translations || {}, price: currentDetailProduct.price, img: currentDetailProduct.images ? currentDetailProduct.images[0] : currentDetailProduct.img, category: currentDetailProduct.category});
        if(heartBtn) {
            heartBtn.classList.add('text-[#d4af37]');
            heartBtn.classList.remove('text-[#1a2e15]');
        }
        showToast('SAVED FOR LATER');
    }
    saveWishlist();
};

// 🟢 RESTYLED: Edge-to-edge layout for the wishlist items
window.renderWishlist = function() {
    const emptyEl = document.getElementById('wishlist-empty');
    const gridEl = document.getElementById('wishlist-grid');
    if (!emptyEl || !gridEl) return;

    if (wishlist.length === 0) {
        emptyEl.style.display = 'block';
        gridEl.classList.add('hidden');
        return;
    }
    emptyEl.style.display = 'none';
    gridEl.classList.remove('hidden');
    
    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
        if (SAYAND_PRODUCTS.sales) allProducts = allProducts.concat(SAYAND_PRODUCTS.sales);
        allProducts=allProducts.filter((p,i,list)=>list.findIndex(x=>x.name===p.name)===i);
        if (SAYAND_PRODUCTS.sales) allProducts = allProducts.concat(SAYAND_PRODUCTS.sales);
    }
    
    gridEl.innerHTML = wishlist.map(w => {
        const fullProduct = allProducts.find(p => p.name === w.name);
        const prodDataStr = fullProduct ? encodeURIComponent(JSON.stringify(fullProduct)) : '';
        const displayPrice = fullProduct && isSaleActive(fullProduct) ? fullProduct.salePrice : (fullProduct ? fullProduct.price : w.price);
        return `
            <div class="group cursor-pointer relative flex flex-col w-full">
                <div class="w-full aspect-[4/5] bg-[#eef2ec] overflow-hidden mb-3 relative" onclick="${prodDataStr ? `openProductDetail('${prodDataStr}');closeWishlist();` : ''}">
                    <img src="${w.img}" alt="${sayandAlt(w.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                </div>
                <div class="flex flex-col items-start text-left w-full px-1">
                    <h4 class="text-[11px] font-semibold tracking-wide text-[#1a2e15] truncate uppercase w-full group-hover:text-[#d4af37] transition-colors mb-1">${SayandI18n.productHTML(w)}</h4>
                    <p class="text-[11px] text-[#1a2e15] font-medium">${formatPrice(displayPrice)}</p>
                </div>
                <button onclick="removeFromWishlist('${w.name}')" class="absolute top-2 right-2 w-8 h-8 bg-[#f9f6f0]/90 rounded-full flex items-center justify-center hover:bg-red-50 transition-colors z-10 shadow-sm border border-[#c2c9c0]/50">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;
    }).join('');
};

window.removeFromWishlist = function(name) {
    wishlist = wishlist.filter(w => w.name !== name);
    saveWishlist();
    if (currentDetailProduct && currentDetailProduct.name === name) {
        const heartBtn = document.getElementById('detail-heart');
        if(heartBtn) {
            heartBtn.classList.remove('text-[#d4af37]');
            heartBtn.classList.add('text-[#1a2e15]');
        }
    }
};

const wishlistToggle = document.getElementById('wishlist-toggle');
if (wishlistToggle) wishlistToggle.addEventListener('click', (e) => { e.preventDefault(); openWishlist(); });

window.openWishlist = function() { 
    renderWishlist(); 
    const wp = document.getElementById('wishlist-page');
    if(wp) wp.style.transform = 'translateX(0)'; 
    document.body.style.overflow = 'hidden'; 
};
window.closeWishlist = function() { 
    const wp = document.getElementById('wishlist-page');
    if(wp) wp.style.transform = 'translateX(100%)'; 
    document.body.style.overflow = ''; 
};
updateWishlistCount();

window.toggleShareMenu = function() {
    const menu = document.getElementById('detail-share-menu');
    if(menu) {
        menu.classList.toggle('hidden');
        menu.classList.toggle('open');
    }
};
window.shareProduct = function(method) {
    if (!currentDetailProduct) return;
    const text = `Check out ${currentDetailProduct.name} from SAYAND - €${currentDetailProduct.price}`;
    if (method === 'copy') {
        navigator.clipboard.writeText(window.location.href).then(() => showToast('LINK COPIED'));
    } else if (method === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + window.location.href)}`, '_blank');
    } else if (method === 'email') {
        window.open(`mailto:?subject=${encodeURIComponent('Check this out from SAYAND')}&body=${encodeURIComponent(text)}`, '_blank');
    }
    const menu = document.getElementById('detail-share-menu');
    if(menu) {
        menu.classList.remove('open');
        menu.classList.add('hidden');
    }
};

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
window.showToast = showToast;

const addBtn = document.getElementById('detail-add-btn');
if (addBtn) {
    addBtn.addEventListener('click', () => {
        const user = firebase.auth().currentUser;

        if (!user) {
            alert("Please log in to add items to your bag or place a pre-order.");
            window.location.href = "login.html";
            return;
        }

        if (!currentDetailProduct) return;

        // ─── HANDLE OUT OF STOCK → OPEN NOTIFY MODAL ───
        let sizeQty = 0;
        if (currentDetailProduct.sizeQuantities && currentDetailProduct.sizeQuantities[currentDetailSize] !== undefined) {
            sizeQty = parseInt(currentDetailProduct.sizeQuantities[currentDetailSize]);
        } else {
            sizeQty = currentDetailProduct.quantity !== undefined ? parseInt(currentDetailProduct.quantity) : 1;
        }
        const isOOS = currentDetailProduct.isOutOfStock || sizeQty <= 0;

        if (isOOS && !currentDetailProduct.isPreorder) {
            openNotifyModal();
            return;
        }
        // ─── END NOTIFY INTERCEPT ───

        if (currentDetailProduct.isPreorder) {
            SayandServices.call('registerPreorder',{productName:currentDetailProduct.name,size:currentDetailSize}).then(()=>showToast('PREORDER INTEREST REGISTERED')).catch(e=>alert(e.message));
            return; 
        }
        
        let sizeMaxQty = 1;
        if (currentDetailProduct.sizeQuantities && currentDetailProduct.sizeQuantities[currentDetailSize] !== undefined) {
            sizeMaxQty = parseInt(currentDetailProduct.sizeQuantities[currentDetailSize]);
        } else {
            sizeMaxQty = currentDetailProduct.quantity !== undefined ? parseInt(currentDetailProduct.quantity) : 1;
        }

        const qtyEl = document.getElementById('customer-qty');
        const selectedQty = qtyEl ? (parseInt(qtyEl.value) || 1) : 1;
        const productName = currentDetailProduct.name;
        const activeSale = isSaleActive(currentDetailProduct);
        const numericPrice = parseFloat(activeSale ? currentDetailProduct.salePrice : currentDetailProduct.price);
        const productImage = currentDetailProduct.images ? currentDetailProduct.images[0] : currentDetailProduct.img;
        const itemKey = `${productName}_${currentDetailSize}_${currentDetailColor}`.replace(/[^a-zA-Z0-9]/g, '_');
        const itemRef = firebase.database().ref(`users/${user.uid}/cart/${itemKey}`);

        itemRef.once('value').then(async (snapshot) => {
            if (snapshot.exists()) {
                const currentQty = snapshot.val().quantity;
                if (currentQty + selectedQty > sizeMaxQty) {
                    alert(`Sorry, only ${sizeMaxQty} in stock for this size!`);
                    return;
                }
                await itemRef.update({ quantity: currentQty + selectedQty });
            } else {
                if (selectedQty > sizeMaxQty) {
                    alert(`Sorry, only ${sizeMaxQty} in stock for this size!`);
                    return;
                }
                await itemRef.set({
                    name: productName,
                    translations: currentDetailProduct.translations || {},
                    price: numericPrice,
                    quantity: selectedQty,
                    maxStock: sizeMaxQty, 
                    image: productImage,
                    size: currentDetailSize,
                    color: currentDetailColor,
                    addedAt: firebase.database.ServerValue.TIMESTAMP
                });
            }

            window.SayandAnalytics?.shopping('add_to_cart', [{name:productName, category:currentDetailProduct.category, price:numericPrice, quantity:selectedQty, size:currentDetailSize, color:currentDetailColor}]);
            showToast('ADDED TO BAG');
            toggleCart(true); 
        }).catch(() => showToast('Could not add this item. Please try again.'));
    });
}

window.closeEditorial = function() {
    const page = document.getElementById('editorial-page');
    if(page) page.style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
};

window.openSalesPage = function() {
    const page = document.getElementById('sales-page');
    if (page) {
        page.style.transform = 'translateY(0)';
        document.body.style.overflow = 'hidden';
    } else {
        window.location.href = 'sales.html';
    }
};

window.closeSalesPage = function() {
    const page = document.getElementById('sales-page');
    if (page) page.style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
};

window.openCollection = function(categoryFilter, title) {
    const titleEl = document.getElementById('collection-title');
    if(titleEl) titleEl.innerText = title;
    
    const collectionGrid = document.getElementById('collection-grid');
    if(!collectionGrid) return;

    collectionGrid.innerHTML = '';
    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
        if (SAYAND_PRODUCTS.sales) allProducts = allProducts.concat(SAYAND_PRODUCTS.sales);
        allProducts=allProducts.filter((p,i,list)=>list.findIndex(x=>x.name===p.name)===i);
    }
    const filtered = categoryFilter === 'all' ? allProducts : allProducts.filter(p => p.category === categoryFilter);
    if (filtered.length === 0) {
        collectionGrid.innerHTML = '<p class="text-xs tracking-widest text-[#6a7c64] font-bold col-span-full uppercase">Products coming soon. Add some via the Admin Dashboard!</p>';
    } else {
        filtered.forEach(p => {
            const el = document.createElement('div');
            el.className = 'group cursor-pointer flex flex-col w-full';
            el.innerHTML = createProductCardHTML(p, false); 
            collectionGrid.appendChild(el);
        });
    }
    
    const folder = document.getElementById('collection-folder');
    if(folder) folder.style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
};

window.closeCollection = function() {
    const folder = document.getElementById('collection-folder');
    if(folder) folder.style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
};

document.addEventListener('click', (e) => {
    const shareMenu = document.getElementById('detail-share-menu');
    const shareBtn = document.getElementById('detail-share-btn');
    if (shareMenu && shareMenu.classList.contains('open') && !shareMenu.contains(e.target) && e.target !== shareBtn && !shareBtn.contains(e.target)) {
        shareMenu.classList.remove('open');
        shareMenu.classList.add('hidden');
    }
});

window.openSearch = function() {
    const overlay = document.getElementById('search-overlay');
    if(overlay) overlay.style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        const input = document.getElementById('search-input');
        if(input) input.focus();
    }, 500);
};

window.closeSearch = function() {
    const overlay = document.getElementById('search-overlay');
    if(overlay) overlay.style.transform = 'translateY(-100%)';
    document.body.style.overflow = '';
    
    const input = document.getElementById('search-input');
    if(input) input.value = '';
    
    const grid = document.getElementById('search-results-grid');
    if(grid) grid.innerHTML = '<p class="text-[#6a7c64] text-xs tracking-widest font-bold uppercase col-span-full">Start typing to search for products...</p>';
};

window.handleSearch = function() {
    const input = document.getElementById('search-input');
    if(!input) return;
    
    const query = input.value.toLowerCase().trim();
    const resultsGrid = document.getElementById('search-results-grid');
    if(!resultsGrid) return;
    
    if (query.length === 0) {
        resultsGrid.innerHTML = '<p class="text-[#6a7c64] text-xs font-bold tracking-widest col-span-full uppercase">Start typing to search for products...</p>';
        return;
    }

    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
        if (SAYAND_PRODUCTS.sales) allProducts = allProducts.concat(SAYAND_PRODUCTS.sales);
        allProducts=allProducts.filter((p,i,list)=>list.findIndex(x=>x.name===p.name)===i);
    }

    const uniqueProducts = [];
    const seen = new Set();
    for (const p of allProducts) {
        if (!seen.has(p.name)) {
            seen.add(p.name);
            uniqueProducts.push(p);
        }
    }

    const filtered = uniqueProducts.filter(p => 
        p.name.toLowerCase().includes(query) || 
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.translations && Object.values(p.translations).some(texts => [texts.name, texts.description].some(text => text && text.toLowerCase().includes(query))))
    );

    if (filtered.length === 0) {
        resultsGrid.innerHTML = '<p class="text-[#6a7c64] text-xs font-bold tracking-widest uppercase col-span-full">No products found matching your search.</p>';
    } else {
        resultsGrid.innerHTML = filtered.map(p => {
            const el = document.createElement('div');
            el.className = 'group cursor-pointer flex flex-col w-full';
            el.innerHTML = createProductCardHTML(p, false);
            return el.outerHTML;
        }).join('');
    }
};

const LEGAL_PAGES = ['privacy', 'terms', 'cookie', 'shipping', 'returns'];

function getFooterPage(page) {
    if (typeof SAYAND_PRODUCTS !== 'undefined' && SAYAND_PRODUCTS && SAYAND_PRODUCTS.footer && SAYAND_PRODUCTS.footer[page]) {
        return SAYAND_PRODUCTS.footer[page];
    }
    return { title: page.toUpperCase(), content: '<p class="text-[#6a7c64] font-bold text-xs uppercase tracking-widest">Content loading. Please check your connection.</p>' };
}

window.openInfoPage = function(page) {
    if (LEGAL_PAGES.includes(page)) {
        window.location.href = page + '.html';
        return;
    }
    
    history.pushState({page: page, overlay: true}, '', '#' + page);
    
    const title = document.getElementById('info-title');
    const content = document.getElementById('info-content');
    const pageOverlay = document.getElementById('info-page');
    
    const data = getFooterPage(page);
    if (!data) return;

    SayandI18n.bind(title, data.title, SayandI18n.fieldTranslations(data, 'title'));
    SayandI18n.bind(content, data.content, SayandI18n.fieldTranslations(data, 'content'), true);

    if(pageOverlay) {
        pageOverlay.style.transform = 'translateY(0)';
        document.body.style.overflow = 'hidden';
    }
    
    const scrollContainer = document.querySelector('#info-page .overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTop = 0;
};

window.closeInfoPage = function() {
    const pageOverlay = document.getElementById('info-page');
    if(pageOverlay) pageOverlay.style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
    
    if (window.location.hash) {
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
};

window.addEventListener('popstate', function(e) {
    const hash = window.location.hash.replace('#', '');
    const overlay = document.getElementById('info-page');
    
    if (!hash && overlay) {
        overlay.style.transform = 'translateY(100%)';
        document.body.style.overflow = '';
    } else if (!LEGAL_PAGES.includes(hash)) {
        const preDiv = document.getElementById('prerender-' + hash);
        if (preDiv && overlay) {
            const t = preDiv.querySelector('.pre-title');
            const c = preDiv.querySelector('.pre-content');
            if(t) document.getElementById('info-title').innerHTML = t.innerHTML;
            if(c) document.getElementById('info-content').innerHTML = c.innerHTML;
            overlay.style.transform = 'translateY(0)';
            document.body.style.overflow = 'hidden';
        }
    }
});

// ==================== NOTIFY ME (BACK IN STOCK) ====================
window.openNotifyModal = function() {
    const user = firebase.auth().currentUser;
    if (!user) {
        alert("Please sign in to get back-in-stock alerts.");
        window.location.href = "login.html";
        return;
    }
    if (!currentDetailProduct) return;
    
    const modal = document.getElementById('notify-modal');
    const sizeContainer = document.getElementById('notify-size-options');
    const errorEl = document.getElementById('notify-error');
    
    if (!modal || !sizeContainer) {
        console.error('[SAYAND] Notify modal elements missing from DOM.');
        showToast('ERROR: NOTIFY MODAL NOT FOUND');
        return;
    }
    
    if(errorEl) {
        errorEl.innerText = '';
        errorEl.classList.add('hidden');
    }
    
    sizeContainer.innerHTML = '';
    currentNotifySize = '';
    
    const sizes = currentDetailProduct.sizes && currentDetailProduct.sizes.length ? currentDetailProduct.sizes : ['OS'];
    
    sizes.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'flex-1 min-w-[60px] py-3 border border-[#c2c9c0] text-[10px] font-black tracking-widest uppercase text-[#6a7c64] hover:border-[#1a2e15] hover:text-[#1a2e15] transition-all';
        btn.innerText = s;
        btn.onclick = function() {
            currentNotifySize = s;
            Array.from(sizeContainer.children).forEach(c => {
                c.classList.remove('bg-[#1a2e15]', 'text-[#d4af37]', 'border-[#d4af37]');
                c.classList.add('border-[#c2c9c0]', 'text-[#6a7c64]');
            });
            btn.classList.remove('border-[#c2c9c0]', 'text-[#6a7c64]');
            btn.classList.add('bg-[#1a2e15]', 'text-[#d4af37]', 'border-[#d4af37]');
            if(errorEl) errorEl.classList.add('hidden');
        };
        sizeContainer.appendChild(btn);
    });
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeNotifyModal = function() {
    const modal = document.getElementById('notify-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentNotifySize = '';
};

window.submitNotifyRequest = async function() {
    const user = firebase.auth().currentUser;
    if (!user) {
        alert("Please sign in first.");
        return;
    }
    if (!currentDetailProduct) return;
    if (!currentNotifySize) {
        const errorEl = document.getElementById('notify-error');
        if(errorEl) {
            errorEl.innerText = 'PLEASE SELECT A SIZE';
            errorEl.classList.remove('hidden');
        }
        return;
    }
    
    const productName = currentDetailProduct.name;
    const safeProdId = productName.replace(/[^a-zA-Z0-9]/g, '_');
    const dbRef = (typeof window.db !== 'undefined' && window.db) ? window.db : firebase.database();
    const notifyRef = dbRef.ref(`stockNotifications/${safeProdId}`);
    
    const errorEl = document.getElementById('notify-error');
    const submitBtn = document.querySelector('#notify-modal button[onclick="submitNotifyRequest()"]');
    const originalBtnText = submitBtn ? submitBtn.innerText : 'NOTIFY ME';
    
    if (submitBtn) {
        submitBtn.innerText = 'SAVING...';
        submitBtn.disabled = true;
    }
    
    try {
        // Check for duplicate request (same user + same size)
        const existingSnap = await notifyRef.orderByChild('uid').equalTo(user.uid).once('value');
        let alreadyRequested = false;
        if (existingSnap.exists()) {
            existingSnap.forEach(child => {
                const val = child.val();
                if (val && val.uid === user.uid && val.size === currentNotifySize) {
                    alreadyRequested = true;
                }
            });
        }
        
        if (alreadyRequested) {
            if(errorEl) {
                errorEl.innerText = 'YOU ARE ALREADY ON THE LIST FOR THIS SIZE';
                errorEl.classList.remove('hidden');
            }
            if (submitBtn) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
            return;
        }
        
        await notifyRef.push({
            uid: user.uid,
            email: user.email || '',
            size: currentNotifySize,
            productName: productName,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        closeNotifyModal();
        showToast('ALERT SET! WE WILL EMAIL YOU');
        
    } catch (err) {
        console.error('[SAYAND] Notify error:', err);
        if(errorEl) {
            if (err.message && err.message.toUpperCase().includes('PERMISSION')) {
                errorEl.innerText = 'ERROR: PERMISSION DENIED. CHECK FIREBASE RULES.';
            } else {
                errorEl.innerText = 'ERROR: ' + (err.message || 'PLEASE TRY AGAIN.');
            }
            errorEl.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.innerText = originalBtnText;
            submitBtn.disabled = false;
        }
    }
};
    


function handleHashRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'returns') { window.location.replace('returns.html'); return; }
    if (hash && !LEGAL_PAGES.includes(hash)) {
        setTimeout(() => {
            const preDiv = document.getElementById('prerender-' + hash);
            if (preDiv) {
                const title = document.getElementById('info-title');
                const content = document.getElementById('info-content');
                const pageOverlay = document.getElementById('info-page');
                
                const t = preDiv.querySelector('.pre-title');
                const c = preDiv.querySelector('.pre-content');
                if(title && t) title.innerHTML = t.innerHTML;
                if(content && c) content.innerHTML = c.innerHTML;
                
                if(pageOverlay) {
                    pageOverlay.style.transform = 'translateY(0)';
                    document.body.style.overflow = 'hidden';
                }
            }
        }, 600);
    }
}

// ==================== FIXED SUBSCRIBE HANDLER ====================
window.handleSubscribe = async function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('subscribe-email');
    if (!emailInput) return;
    const consent = document.getElementById('subscribe-consent');
    if (!consent || !consent.checked) { showToast('Please confirm newsletter consent.'); return; }

    const email = emailInput.value.trim().toLowerCase();
    
    if (!email || !email.includes('@') || !email.includes('.')) {
        showToast('PLEASE ENTER A VALID EMAIL');
        return;
    }
    
    const subscribeBtn = e.target.querySelector('button[type="submit"]');
    const originalText = subscribeBtn ? subscribeBtn.innerText : 'SUBSCRIBE';
    if (subscribeBtn) {
        subscribeBtn.innerText = 'SUBMITTING...';
        subscribeBtn.disabled = true;
    }
    
    const dbRef = (typeof window.db !== 'undefined' && window.db) ? window.db : firebase.database();

    try {
        await SayandServices.call('subscribeNewsletter',{email});
        showToast('CHECK YOUR EMAIL TO CONFIRM YOUR SUBSCRIPTION');
        emailInput.value = '';
        if (subscribeBtn) {
            subscribeBtn.innerText = 'SUBSCRIBED ✓';
            setTimeout(() => {
                subscribeBtn.innerText = originalText;
                subscribeBtn.disabled = false;
            }, 3000);
        }

    } catch (err) {
        console.error('Subscribe error:', err);
        showToast('ERROR: PLEASE TRY AGAIN');
        if (subscribeBtn) {
            subscribeBtn.innerText = originalText;
            subscribeBtn.disabled = false;
        }
    }
};

(function forceTop() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    });
    
    setTimeout(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, 0);
    
    setTimeout(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, 100);
})();

window.addEventListener('load', function() {
    const overlays = [
        { id: 'product-detail', hide: 'translateY(100%)' },
        { id: 'wishlist-page', hide: 'translateX(100%)' },
        { id: 'sales-page', hide: 'translateY(100%)' }, 
        { id: 'collection-folder', hide: 'translateY(100%)' },
        { id: 'editorial-page', hide: 'translateY(100%)' },
        { id: 'info-page', hide: 'translateY(100%)' },
        { id: 'search-overlay', hide: 'translateY(-100%)' }
    ];
    
    overlays.forEach(o => {
        const el = document.getElementById(o.id);
        if (el) el.style.transform = o.hide;
    });
    
    document.body.style.overflow = '';
    
    if (window.location.hash && !window.location.hash.includes('?')) {
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
});

const cartSidebar = document.getElementById('shopping-bag');
const cartOverlay = document.getElementById('cart-overlay');

function toggleCart(open) {
    if(cartSidebar) cartSidebar.style.transform = open ? 'translateX(0)' : 'translateX(100%)';
    if(cartOverlay) {
        if (open) {
            cartOverlay.classList.remove('hidden');
            setTimeout(() => cartOverlay.classList.remove('opacity-0'), 10);
        } else {
            cartOverlay.classList.add('opacity-0');
            setTimeout(() => cartOverlay.classList.add('hidden'), 300);
        }
    }
}

const cartToggleBtn = document.getElementById('cart-toggle');
if(cartToggleBtn) cartToggleBtn.addEventListener('click', (e) => { e.preventDefault(); toggleCart(true); });

const closeCartBtn = document.getElementById('close-cart');
if(closeCartBtn) closeCartBtn.addEventListener('click', () => toggleCart(false));

if(cartOverlay) cartOverlay.addEventListener('click', () => toggleCart(false));

firebase.auth().onAuthStateChanged((user) => {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCountBadge = document.getElementById('cart-count');
    const cartTotalDisplay = document.getElementById('cart-total');

    if (user) {
        
        firebase.database().ref(`users/${user.uid}/fitProfile`).on('value', snap => {
            window.userFitPrefs = snap.val();
        });

        // Calculate VIP Status for Storefront rendering
        firebase.database().ref('orders').orderByChild('userId').equalTo(user.uid).on('value', snap => {
            const orders = snap.val();
            let count200 = 0;
            if (orders) {
                Object.values(orders).forEach(o => {
                    if ((o.paymentDate || o.stripeSessionId) && !/cancel|refund/i.test(o.status || '')) {
                        if ((o.totalAmount || 0) >= 200) count200++;
                    }
                });
            }
            window.userIsVip = (count200 >= 3);
            window.authSettled = true; 

            if (typeof renderAllProducts === 'function' && window.SAYAND_PRODUCTS) {
                renderAllProducts(window.SAYAND_PRODUCTS);
            }
        });

        const cartRef = firebase.database().ref(`users/${user.uid}/cart`);
        
         cartRef.on('value', (snapshot) => {
            const cartData = snapshot.val();
            let totalItems = 0;
            let totalPrice = 0;
            let html = '';
            let hasCriticalStockIssue = false;

            if (cartData) {
                Object.keys(cartData).forEach(key => {
                    const item = cartData[key];
                    
                    // ─── LIVE STOCK CHECK ───
                    let stockWarning = '';
                    let isOOS = false;
                    
                    if (window.SAYAND_PRODUCTS) {
                        let foundProduct = null;
                        const sections = ['newArrivals', 'trending', 'sales', 'upcomingSales'];
                        for (const sec of sections) {
                            if (window.SAYAND_PRODUCTS[sec] && Array.isArray(window.SAYAND_PRODUCTS[sec])) {
                                const match = window.SAYAND_PRODUCTS[sec].find(p => p.name === item.name);
                                if (match) { foundProduct = match; break; }
                            }
                        }
                        
                        if (foundProduct && !foundProduct.isPreorder) {
                            if (foundProduct.isOutOfStock) {
                                isOOS = true;
                                stockWarning = 'SOLD OUT';
                                hasCriticalStockIssue = true;
                            } else if (foundProduct.sizeQuantities && Object.keys(foundProduct.sizeQuantities).length > 0) {
                                // Product uses size-based inventory
                                const cartSize = item.size || 'OS';
                                const sizeStock = foundProduct.sizeQuantities[cartSize];
                                
                                if (sizeStock !== undefined) {
                                    // Specific size found - check it
                                    const liveStock = parseInt(sizeStock);
                                    if (liveStock <= 0) {
                                        isOOS = true;
                                        stockWarning = 'SOLD OUT';
                                        hasCriticalStockIssue = true;
                                    } else if (item.quantity > liveStock) {
                                        stockWarning = `Only ${liveStock} left`;
                                    }
                                } else {
                                    // Size key not found - sum ALL size quantities as fallback
                                    const totalStock = Object.values(foundProduct.sizeQuantities).reduce((sum, q) => sum + (parseInt(q) || 0), 0);
                                    if (totalStock <= 0) {
                                        isOOS = true;
                                        stockWarning = 'SOLD OUT';
                                        hasCriticalStockIssue = true;
                                    } else if (item.quantity > totalStock) {
                                        stockWarning = `Only ${totalStock} left`;
                                    }
                                }
                            } else {
                                // Product uses simple quantity
                                const liveStock = parseInt(foundProduct.quantity || 0);
                                if (liveStock <= 0) {
                                    isOOS = true;
                                    stockWarning = 'SOLD OUT';
                                    hasCriticalStockIssue = true;
                                } else if (item.quantity > liveStock) {
                                    stockWarning = `Only ${liveStock} left`;
                                }
                            }
                        }
                    }
                    
                    totalItems += item.quantity;
                    totalPrice += (item.price * item.quantity);
                    
                    const safeName = item.name.replace(/'/g, "\\'");
                    const oosClass = isOOS ? 'bg-red-50 border-red-200' : 'border-[#c2c9c0]/30';
                    const imgOpacity = isOOS ? 'opacity-50 grayscale' : '';
                    const qtyDisabled = isOOS ? 'opacity-50 pointer-events-none' : '';
                    
                    html += `
                        <div class="flex relative border-b ${oosClass} pb-6 mb-6 p-3 rounded">
                            <img src="${item.image}" alt="${sayandAlt(item.name)}" class="w-20 h-28 object-cover border border-[#c2c9c0]/50 ${imgOpacity}" onclick="goToProduct('${safeName}')">
                            
                            <div class="flex-1 ml-4 flex flex-col justify-between">
                                <div>
                                    <h4 class="text-[10px] tracking-widest font-black text-[#1a2e15] uppercase w-11/12 truncate ${isOOS ? 'text-red-800' : ''}">${SayandI18n.productHTML(item)}</h4>
                                    <p class="text-[10px] text-[#6a7c64] font-bold mt-1 uppercase">SIZE: ${item.size} | COLOR: ${item.color}</p>
                                    
                                    ${isOOS ? `<p class="text-[10px] font-black tracking-widest text-red-600 mt-1 uppercase bg-red-100 inline-block px-2 py-0.5">SOLD OUT</p>` : ''}
                                    ${(!isOOS && stockWarning) ? `<p class="text-[10px] font-black tracking-widest text-[#d4af37] mt-1 uppercase">⚠ ${stockWarning}</p>` : ''}
                                    
                                    <div class="inline-flex items-center mt-3 border border-[#c2c9c0] bg-white text-[#1a2e15] ${qtyDisabled}">
                                        <button onclick="updateCartQty('${key}', -1)" class="w-8 h-8 flex items-center justify-center hover:bg-[#eef2ec] hover:text-[#d4af37] transition-colors font-bold">-</button>
                                        <span class="w-8 h-8 flex items-center justify-center text-[10px] font-black border-x border-[#c2c9c0]">${item.quantity}</span>
                                        <button onclick="updateCartQty('${key}', 1)" class="w-8 h-8 flex items-center justify-center hover:bg-[#eef2ec] hover:text-[#d4af37] transition-colors font-bold">+</button>
                                    </div>
                                </div>
                                
                                <p class="text-xs font-black mt-3 ${isOOS ? 'text-red-600 line-through' : 'text-[#2c4c23]'}">${formatPrice(item.price * item.quantity)}</p>
                            </div>
                            
                            <button onclick="removeFromBag('${key}')" class="absolute top-2 right-2 text-[#6a7c64] hover:text-red-600 text-2xl leading-none transition-colors bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-sm border border-[#c2c9c0]/30 z-10">&times;</button>
                        </div>
                    `;
                });

                if(cartItemsContainer) cartItemsContainer.innerHTML = html;
                if(cartCountBadge) { cartCountBadge.textContent = totalItems; cartCountBadge.classList.remove('hidden'); }
                if(cartTotalDisplay) cartTotalDisplay.textContent = formatPrice(totalPrice);

            } else {
                if(cartItemsContainer) cartItemsContainer.innerHTML = '<p class="text-[10px] text-[#6a7c64] font-bold text-center mt-10 uppercase tracking-widest">Your bag is currently empty.</p>';
                if(cartCountBadge) cartCountBadge.classList.add('hidden');
                if(cartTotalDisplay) cartTotalDisplay.textContent = formatPrice(0);
            }

            // ─── CHECKOUT BUTTON STATE (runs for BOTH empty and non-empty cart) ───
            const checkoutBtn = document.getElementById('whatsapp-checkout-btn');
            if (checkoutBtn) {
                if (!cartData || Object.keys(cartData).length === 0) {
                    checkoutBtn.disabled = true;
                    checkoutBtn.innerText = 'BAG EMPTY';
                    checkoutBtn.classList.add('opacity-50', 'cursor-not-allowed');
                } else if (hasCriticalStockIssue) {
                    checkoutBtn.disabled = true;
                    checkoutBtn.innerText = 'SOLD OUT ITEM IN BAG';
                    checkoutBtn.classList.add('opacity-50', 'cursor-not-allowed', 'border-red-600', 'text-red-600');
                    checkoutBtn.classList.remove('border-[#c9a227]', 'text-[#c9a227]');
                } else {
                    checkoutBtn.disabled = false;
                    checkoutBtn.innerText = 'PROCEED TO CHECKOUT';
                    checkoutBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'border-red-600', 'text-red-600');
                    checkoutBtn.classList.add('border-[#c9a227]', 'text-[#c9a227]');
                }
            }
        });
    } else {
        window.userFitPrefs = null;
        window.userIsVip = false;
        window.authSettled = true;
        
        if(cartItemsContainer) cartItemsContainer.innerHTML = '<p class="text-[10px] text-[#6a7c64] font-bold text-center mt-10 uppercase tracking-widest">Please sign in to view your bag.</p>';
        if(cartCountBadge) cartCountBadge.classList.add('hidden');
        if(cartTotalDisplay) cartTotalDisplay.textContent = formatPrice(0);
    }
});

window.updateCartQty = function(key, change) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const itemRef = firebase.database().ref(`users/${user.uid}/cart/${key}`);
    itemRef.once('value').then(snapshot => {
        if (snapshot.exists()) {
            const item = snapshot.val();
            let newQty = item.quantity + change;
            const maxStock = item.maxStock || 10; 
            
            if (newQty > maxStock) {
                if (typeof showToast === 'function') showToast(`ONLY ${maxStock} AVAILABLE`);
                return;
            }
            
            if (newQty < 1) {
                return; 
            }
            
            itemRef.update({ quantity: newQty });
        }
    });
};

window.removeFromBag = function(key) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    firebase.database().ref(`users/${user.uid}/cart/${key}`).remove().then(() => {
        if (typeof showToast === 'function') showToast('ITEM REMOVED');
    });
};

window.goToProduct = function(productName) {
    toggleCart(false);
    
    let foundProduct = null;
    const searchName = productName.toString().trim();
    const searchNameLower = searchName.toLowerCase();
    
    if (typeof SAYAND_PRODUCTS !== 'undefined' && SAYAND_PRODUCTS) {
        for (const key in SAYAND_PRODUCTS) {
            const arr = SAYAND_PRODUCTS[key];
            if (Array.isArray(arr)) {
                for (const p of arr) {
                    if (!p || !p.name) continue;
                    
                    const dbName = p.name.trim();
                    const dbNameLower = dbName.toLowerCase();
                    
                    if (dbNameLower === searchNameLower) {
                        foundProduct = p;
                        break;
                    }
                    if (dbNameLower.includes(searchNameLower) || searchNameLower.includes(dbNameLower)) {
                        foundProduct = p;
                        break;
                    }
                }
                if (foundProduct) break;
            }
        }
    }
    
    if (foundProduct) {
        const safeName = encodeURIComponent(foundProduct.name).replace(/'/g, '%27');
        window.location.href = window.SayandSEO.productUrl(decodeURIComponent(safeName));
    } else {
        const safeName = encodeURIComponent(searchName);
        window.location.href = window.SayandSEO.productUrl(decodeURIComponent(safeName));
    }
};

document.addEventListener('click', (e) => {
    const target = e.target.closest('#whatsapp-checkout-btn');
    if (target) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const user = firebase.auth().currentUser;
        if (!user) {
            alert("Please sign in to proceed to checkout.");
            window.location.href = "login.html";
            return;
        }
        if (user) {
            loadWishlistFromFirebase(); 

            firebase.database().ref(`users/${user.uid}/cart`).once('value').then(snap => {
                if (!snap.exists() || Object.keys(snap.val()).length === 0) {
                    if (typeof showToast === 'function') {
                        showToast('BAG EMPTY. ADD ITEMS TO BAG');
                    } else {
                        alert("BAG EMPTY. ADD ITEMS TO BAG");
                    }
                } else {
                    window.location.href = "checkout.html";
                }
            });
        }
    }
}, true);
// ==================== INITIALIZE NEW FEATURES ====================
document.addEventListener('DOMContentLoaded', () => {
    initCookieBanner();
    loadAnnouncement();
    renderRecentlyViewed();
    initWhatsAppFloat();
    const toggle = document.getElementById('currency-toggle');
    if (toggle) toggle.innerText = window.currentCurrency;

    trackConsentingVisitor();
});
// ==================== WELCOME PREFERENCES ====================
function checkWelcomePreferences() {
    const modal = document.getElementById('welcome-modal');
    if (!modal || localStorage.getItem('sayand_prefs_set')) return;
    const language = document.getElementById('welcome-language');
    const currency = document.getElementById('welcome-currency');
    if (language) language.value = SayandI18n.language;
    if (currency) currency.value = window.currentCurrency || 'EUR';
    const locationLabel = document.getElementById('welcome-location');
    if (locationLabel) locationLabel.textContent = 'Global';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => modal.classList.remove('opacity-0'));
    document.body.style.overflow = 'hidden';
}

window.saveWelcomePreferences = function() {
    const language = document.getElementById('welcome-language').value;
    const currency = document.getElementById('welcome-currency').value;
    localStorage.setItem('sayand_prefs_set', 'true');
    SayandI18n.setLanguage(language);
    window.setCurrency(currency);
    const modal = document.getElementById('welcome-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }, 500);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkWelcomePreferences, {once:true});
} else {
    checkWelcomePreferences();
}
