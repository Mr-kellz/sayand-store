// ==================== PREVENT BROWSER SCROLL RESTORATION ====================
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
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

db.ref("mainStore").on("value", (snapshot) => {
    const data = snapshot.val();
    if (data) {
        window.SAYAND_PRODUCTS = data;
        if (typeof updateContactInfo === 'function') updateContactInfo(data);
        if (typeof updateSiteContent === 'function') updateSiteContent(data);
        if (typeof renderAllProducts === 'function') renderAllProducts(data);
        handleHashRoute(); // <-- ADD THIS LINE
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

// ==================== SITE CONTENT & VIDEO SUPPORT ====================
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
        parent.replaceChild(newEl, el);
    }
}

// ==================== EDITORIAL CAROUSEL LOGIC ====================
let editorialMediaList = [];
let currentEditorialIdx = 0;
let editTouchStartX = 0;
let editTouchEndX = 0;

window.editTouchStart = function(e) { 
    editTouchStartX = e.changedTouches[0].screenX; 
    editTouchEndX = editTouchStartX; 
}

window.editTouchMove = function(e) { 
    editTouchEndX = e.changedTouches[0].screenX; 
}

window.editTouchEnd = function(e) {
    if (editorialMediaList.length <= 1) return;
    const diff = editTouchStartX - editTouchEndX;
    
    if (Math.abs(diff) > 40) { 
        if (diff > 0) { 
            currentEditorialIdx = (currentEditorialIdx + 1) % editorialMediaList.length;
        } else { 
            currentEditorialIdx = (currentEditorialIdx - 1 + editorialMediaList.length) % editorialMediaList.length;
        }
        renderEditorialSlide(currentEditorialIdx);
    }
}

function renderEditorialSlide(idx) {
    setMediaElement('editImg', editorialMediaList[idx]);
    
    const dotsContainer = document.getElementById('editorial-dots');
    if (dotsContainer) {
        if (editorialMediaList.length > 1) {
            dotsContainer.innerHTML = editorialMediaList.map((_, i) => 
                `<span class="w-2 h-2 rounded-full shadow-sm transition-colors duration-300 ${i === idx ? 'bg-white' : 'bg-white/50'}"></span>`
            ).join('');
        } else {
            dotsContainer.innerHTML = ''; 
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
            if (sc.editImg.includes(',')) {
                editorialMediaList = sc.editImg.split(',').map(s => s.trim());
            } else {
                editorialMediaList = [sc.editImg];
            }
            currentEditorialIdx = 0;
            renderEditorialSlide(currentEditorialIdx);
            setMediaElement('editorial-hero-img', editorialMediaList[0]);
        }
        
        if(sc.heroSubtitle) document.getElementById('heroSubtitle').innerText = sc.heroSubtitle;
        if(sc.heroTitle) document.getElementById('heroTitle').innerHTML = sc.heroTitle;
        if(sc.editSubtitle) document.getElementById('editSubtitle').innerText = sc.editSubtitle;
        if(sc.editTitle) document.getElementById('editTitle').innerHTML = sc.editTitle;
        if(sc.editDesc) document.getElementById('editDesc').innerText = sc.editDesc;
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
    dots.forEach((dot, i) => { dot.className = i === idx ? 'w-1.5 h-1.5 rounded-full bg-black shadow-sm' : 'w-1.5 h-1.5 rounded-full bg-gray-300 shadow-sm'; });
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

function createProductCardHTML(p, isNewArrival = false) {
    const imgArray = p.images ? p.images : (p.img ? [p.img] : []);
    const imgArrayStr = JSON.stringify(imgArray).replace(/"/g, '&quot;');
    
    // THIS IS THE MAGIC: It makes the product name safe for the URL!
    const safeName = encodeURIComponent(p.name);
    
    const activeSale = isSaleActive(p);
    
    let carouselHTML = '';
    if (imgArray.length > 1) {
        carouselHTML = `
            <button onclick="prevCardImg(event, this)" class="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity z-20 text-black shadow-md hover:bg-black hover:text-white text-xs">&larr;</button>
            <button onclick="nextCardImg(event, this)" class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity z-20 text-black shadow-md hover:bg-black hover:text-white text-xs">&rarr;</button>
            <div class="absolute bottom-[4.5rem] left-0 right-0 flex justify-center gap-1.5 z-20 opacity-0 group-hover/card:opacity-100 transition-opacity dots-container pointer-events-none">
                ${imgArray.map((_, i) => `<span class="w-1.5 h-1.5 rounded-full ${i===0 ? 'bg-black' : 'bg-gray-300'} shadow-sm"></span>`).join('')}
            </div>`;
    }
    
    let badgeHTML = '';
    if (activeSale) {
        badgeHTML = `<div class="sale-badge">-${p.salePercent}%</div>`;
    } else if (isNewArrival) {
        badgeHTML = `<div class="absolute top-4 right-4 bg-black text-white text-[10px] tracking-wider px-2 py-1 z-20">NEW</div>`;
    }

    let priceHTML = '';
    if (activeSale) {
        priceHTML = `<span class="price-original">$${p.originalPrice || p.price}</span><span class="price-sale">$${p.salePrice}</span>`;
    } else {
        priceHTML = `$${p.price}`;
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
    if (isTotalOOS) {
        oosHTML = `<div class="absolute inset-0 bg-white/60 z-10 flex items-center justify-center pointer-events-none"><span class="bg-black text-white text-[10px] tracking-widest px-3 py-1 font-bold">SOLD OUT</span></div>`;
    }

    // NEW LOGIC: Clicking the image, the title, or the button now redirects to product.html
    return `
        <div class="product-card relative aspect-[3/4] overflow-hidden mb-3 bg-gray-100 group/card w-full" data-images="${imgArrayStr}" data-current-index="0" onmouseenter="hoverCard(this)" onmouseleave="unhoverCard(this)">
            <img src="${imgArray[0]}" onclick="window.location.href='product.html?item=${safeName}'" class="main-img w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-105 cursor-pointer">
            ${oosHTML}
            ${carouselHTML}
            ${badgeHTML}
            <button onclick="window.location.href='product.html?item=${safeName}'" class="absolute bottom-4 left-4 right-4 bg-white py-3 text-[10px] md:text-xs tracking-[0.2em] font-semibold opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 translate-y-2 group-hover/card:translate-y-0 z-30 shadow-lg">CHOOSE OPTIONS</button>
        </div>
        <h4 class="text-xs font-medium tracking-wide mt-2 cursor-pointer hover:text-gray-500" onclick="window.location.href='product.html?item=${safeName}'">${p.name}</h4>
        <p class="text-xs ${activeSale ? 'text-red-600 font-semibold' : 'text-gray-500'} mt-1">${priceHTML}</p>`;
}
let currentDetailProduct = null;
let currentDetailSize = '';
let currentDetailColor = '';
let currentDetailImageIdx = 0;
let countdownInterval = null;
let wishlist = JSON.parse(localStorage.getItem('sayand_wishlist') || '[]');

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
        addBtn.innerText = 'SOLD OUT';
        addBtn.disabled = true;
        addBtn.classList.add('opacity-50', 'cursor-not-allowed');
        if(qtyInput) { qtyInput.disabled = true; qtyInput.value = 0; }
    } else {
        stockEl.innerText = sizeQty + ' IN STOCK';
        stockEl.style.color = '#9ca3af'; 
        addBtn.innerText = 'ADD TO BAG';
        addBtn.disabled = false;
        addBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        if(qtyInput) {
            qtyInput.disabled = false;
            qtyInput.max = sizeQty;
            qtyInput.value = 1;
        }
    }
}

window.openProductDetail = function(encodedProd) {
    const p = JSON.parse(decodeURIComponent(encodedProd));
    currentDetailProduct = p;
    currentDetailImageIdx = 0;
    clearInterval(countdownInterval); 
    
    const imgArray = p.images ? p.images : (p.img ? [p.img] : []);
    const activeSale = isSaleActive(p);
    
    document.getElementById('detail-hero-img').src = imgArray[0];
    
    const thumbsContainer = document.getElementById('detail-thumbs');
    thumbsContainer.innerHTML = imgArray.map((img, i) => `
        <button onclick="setDetailImage(${i})" class="flex-shrink-0 w-16 h-20 border-2 ${i === 0 ? 'border-black' : 'border-transparent'} overflow-hidden transition-all">
            <img src="${img}" class="w-full h-full object-cover">
        </button>`).join('');
    
    const dotsContainer = document.getElementById('detail-dots');
    if (imgArray.length > 1) {
        dotsContainer.innerHTML = imgArray.map((_, i) => `
            <button onclick="setDetailImage(${i})" class="w-2 h-2 rounded-full transition-all ${i === 0 ? 'bg-black' : 'bg-gray-300'}"></button>
        `).join('');
        document.getElementById('swipe-hint').style.display = 'block';
    } else {
        dotsContainer.innerHTML = '';
        document.getElementById('swipe-hint').style.display = 'none';
    }
    
    document.getElementById('detail-name').innerText = p.name;
    
    const priceEl = document.getElementById('detail-price');
    const origPriceEl = document.getElementById('detail-original-price');
    const countdownContainer = document.getElementById('sale-countdown-container');
    const countdownSpan = document.getElementById('sale-countdown');
    
    if (activeSale) {
        priceEl.innerText = '$' + p.salePrice;
        priceEl.classList.add('price-sale');
        origPriceEl.innerText = '$' + (p.originalPrice || p.price);
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
                    priceEl.innerText = '$' + p.price.toFixed(2);
                    priceEl.classList.remove('price-sale');
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
        priceEl.innerText = '$' + p.price.toFixed(2);
        priceEl.classList.remove('price-sale');
        origPriceEl.classList.add('hidden');
        countdownContainer.classList.add('hidden');
    }
    
    const sku = p.name.substring(0,3).toUpperCase() + Math.floor(1000+Math.random()*8999) + '/' + Math.floor(100+Math.random()*899) + '/' + Math.floor(100+Math.random()*899);
    document.getElementById('detail-sku').innerText = sku;
    
    const colors = p.colors && p.colors.length ? p.colors : ['Default'];
    currentDetailColor = colors[0];
    document.getElementById('detail-color').innerText = currentDetailColor.toUpperCase();
    
    const sizes = p.sizes && p.sizes.length ? p.sizes : ['OS'];
    currentDetailSize = sizes[0]; 
    for(let s of sizes) {
        let q = p.sizeQuantities ? parseInt(p.sizeQuantities[s] || 0) : parseInt(p.quantity||1);
        if(q > 0) { currentDetailSize = s; break; }
    }

    renderDetailSizes(sizes);
    updateProductStockUI();
    
    document.getElementById('detail-description').innerText = p.description || `Premium quality ${p.category || 'fashion'} piece from SAYAND.`;
    renderDetailDetails(p);
    renderDetailMeasurements(p);
    
    const modelImg = document.getElementById('detail-model-img');
    if (imgArray.length > 1) { modelImg.src = imgArray[1]; modelImg.style.display = 'block'; }
    else { modelImg.style.display = 'none'; }
    
    renderRelatedProducts(p);
    switchDetailTab('description');
    
    const heartBtn = document.getElementById('detail-heart');
    const isLiked = wishlist.some(w => w.name === p.name);
    heartBtn.classList.toggle('liked', isLiked);
    
    document.getElementById('detail-share-menu').classList.remove('open');
    document.getElementById('product-detail').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
    document.getElementById('detail-scroll').scrollTop = 0;
};

window.closeProductDetail = function() {
    clearInterval(countdownInterval);
    document.getElementById('product-detail').style.transform = 'translateY(100%)';
    document.getElementById('detail-share-menu').classList.remove('open');
    if(document.getElementById('cart-overlay').classList.contains('hidden')) {
        document.body.style.overflow = '';
    }
};

window.setDetailImage = function(idx) {
    const imgArray = currentDetailProduct ? (currentDetailProduct.images || [currentDetailProduct.img]) : [];
    currentDetailImageIdx = idx;
    document.getElementById('detail-hero-img').src = imgArray[idx];
    
    const thumbs = document.getElementById('detail-thumbs').children;
    for (let i = 0; i < thumbs.length; i++) {
        thumbs[i].className = `flex-shrink-0 w-16 h-20 border-2 ${i === idx ? 'border-black' : 'border-transparent'} overflow-hidden transition-all`;
    }
    const dots = document.getElementById('detail-dots').children;
    for (let i = 0; i < dots.length; i++) {
        dots[i].className = `w-2 h-2 rounded-full transition-all ${i === idx ? 'bg-black' : 'bg-gray-300'}`;
    }
};

window.renderDetailSizes = function(sizes) {
    const container = document.getElementById('detail-sizes');
    const p = currentDetailProduct;
    
    container.innerHTML = sizes.map((s, i) => {
        let qty = 0;
        if (p.sizeQuantities && p.sizeQuantities[s] !== undefined) {
            qty = parseInt(p.sizeQuantities[s]);
        } else {
            qty = p.quantity !== undefined ? parseInt(p.quantity) : 1;
        }

        const isSizeOOS = p.isOutOfStock || qty <= 0;
        const disabledClass = isSizeOOS ? 'disabled' : '';
        
        const clickFunc = isSizeOOS ? '' : `onclick="currentDetailSize='${s}'; renderDetailSizes(${JSON.stringify(sizes).replace(/"/g,"'")}); updateProductStockUI();"`;

        let stockText = '';
        if (isSizeOOS) stockText = 'Out of Stock';
        else if (qty < 5) stockText = 'Few left';

        return `
            <div class="size-option text-center ${currentDetailSize === s ? 'selected' : ''} ${disabledClass}" ${clickFunc}>
                <div class="text-sm ${currentDetailSize === s ? 'font-semibold' : 'text-gray-400'}">${s}</div>
                ${stockText ? `<div class="size-stock ${isSizeOOS?'text-red-400':''}">${stockText}</div>` : ''}
            </div>`;
    }).join('');
};

window.renderDetailDetails = function(p) {
    const container = document.getElementById('detail-details-list');
    const details = p.details || {Material: 'Premium fabric blend', Fit: 'Regular', Care: 'Follow label instructions', Origin: 'Imported'};
    container.innerHTML = Object.entries(details).map(([key, value]) => `
        <div class="flex justify-between py-3 border-b border-gray-800">
            <span class="text-gray-500 text-xs tracking-wider">${key.toUpperCase()}</span>
            <span class="text-white text-xs">${value}</span>
        </div>`).join('');
};

window.renderDetailMeasurements = function(p) {
    const container = document.getElementById('detail-measurements-list');
    const measurements = p.measurements || {OS: {Chest: '98cm', Length: '70cm'}};
    container.innerHTML = Object.entries(measurements).map(([size, vals]) => `
        <div>
            <div class="text-xs font-semibold text-white mb-2 tracking-wider">SIZE ${size}</div>
            <div class="space-y-1">
                ${Object.entries(vals).map(([k, v]) => `<div class="flex justify-between py-1"><span class="text-gray-500 text-xs">${k}</span><span class="text-gray-300 text-xs">${v}</span></div>`).join('')}
            </div>
        </div>`).join('');
};

window.switchDetailTab = function(tab) {
    document.querySelectorAll('.detail-tab').forEach(t => { t.classList.toggle('active', t.dataset.tab === tab); });
    document.querySelectorAll('.detail-tab-content').forEach(c => { c.classList.toggle('hidden', c.id !== `tab-${tab}`); });
    const activeContent = document.getElementById(`tab-${tab}`);
    activeContent.classList.remove('detail-content-enter');
    void activeContent.offsetWidth;
    activeContent.classList.add('detail-content-enter');
};

window.toggleAccordion = function(header) {
    const body = header.nextElementSibling;
    const icon = header.querySelector('.accordion-icon');
    body.classList.toggle('open');
    icon.classList.toggle('open');
};

window.renderRelatedProducts = function(currentP) {
    const relatedContainer = document.getElementById('detail-related');
    const interestedContainer = document.getElementById('detail-interested');
    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
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
        const prodDataStr = encodeURIComponent(JSON.stringify(p));
        return `<div class="cursor-pointer" onclick="openProductDetail('${prodDataStr}')"><div class="aspect-[3/4] bg-gray-100 overflow-hidden mb-2"><img src="${img}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"></div><p class="text-[10px] text-gray-400">$${p.salePrice || p.price}</p><button class="w-full border border-gray-700 text-gray-400 py-2 text-[10px] tracking-wider hover:border-white hover:text-white transition-colors mt-1">+</button></div>`;
    };
    relatedContainer.innerHTML = related.map(createMiniCard).join('') || '<p class="text-xs text-gray-600 col-span-3">No related items</p>';
    const interested = allProducts.filter(p => p.name !== currentP.name && p.category !== currentP.category).slice(0, 3);
    interestedContainer.innerHTML = interested.map(createMiniCard).join('') || '<p class="text-xs text-gray-600 col-span-3">No recommendations</p>';
};

function saveWishlist() {
    localStorage.setItem('sayand_wishlist', JSON.stringify(wishlist));
    updateWishlistCount();
    renderWishlist();
}
function updateWishlistCount() {
    const count = document.getElementById('wishlist-count');
    count.innerText = wishlist.length;
    count.classList.toggle('hidden', wishlist.length === 0);
}
window.toggleWishlistCurrent = function() {
    if (!currentDetailProduct) return;
    const idx = wishlist.findIndex(w => w.name === currentDetailProduct.name);
    const heartBtn = document.getElementById('detail-heart');
    if (idx >= 0) {
        wishlist.splice(idx, 1);
        heartBtn.classList.remove('liked');
        showToast('REMOVED FROM SAVED');
    } else {
        wishlist.push({name: currentDetailProduct.name, price: currentDetailProduct.price, img: currentDetailProduct.images ? currentDetailProduct.images[0] : currentDetailProduct.img, category: currentDetailProduct.category});
        heartBtn.classList.add('liked');
        showToast('SAVED FOR LATER');
    }
    saveWishlist();
};
window.renderWishlist = function() {
    const emptyEl = document.getElementById('wishlist-empty');
    const gridEl = document.getElementById('wishlist-grid');
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
    }
    
    gridEl.innerHTML = wishlist.map(w => {
        const fullProduct = allProducts.find(p => p.name === w.name);
        const prodDataStr = fullProduct ? encodeURIComponent(JSON.stringify(fullProduct)) : '';
        return `
            <div class="group cursor-pointer relative">
                <div class="aspect-[3/4] bg-gray-100 overflow-hidden mb-2 relative" onclick="${prodDataStr ? `openProductDetail('${prodDataStr}');closeWishlist();` : ''}">
                    <img src="${w.img}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500">
                </div>
                <h4 class="text-xs font-medium tracking-wide">${w.name}</h4>
                <p class="text-xs text-gray-500 mt-1">$${w.price}</p>
                <button onclick="removeFromWishlist('${w.name}')" class="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-red-50 transition-colors z-10">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;
    }).join('');
};
window.removeFromWishlist = function(name) {
    wishlist = wishlist.filter(w => w.name !== name);
    saveWishlist();
    if (currentDetailProduct && currentDetailProduct.name === name) {
        document.getElementById('detail-heart').classList.remove('liked');
    }
};
document.getElementById('wishlist-toggle').addEventListener('click', (e) => { e.preventDefault(); openWishlist(); });
window.openWishlist = function() { renderWishlist(); document.getElementById('wishlist-page').style.transform = 'translateX(0)'; document.body.style.overflow = 'hidden'; };
window.closeWishlist = function() { document.getElementById('wishlist-page').style.transform = 'translateX(100%)'; document.body.style.overflow = ''; };
updateWishlistCount();

window.toggleShareMenu = function() {
    document.getElementById('detail-share-menu').classList.toggle('open');
};
window.shareProduct = function(method) {
    if (!currentDetailProduct) return;
    const text = `Check out ${currentDetailProduct.name} from SAYAND - $${currentDetailProduct.price}`;
    if (method === 'copy') {
        navigator.clipboard.writeText(window.location.href).then(() => showToast('LINK COPIED'));
    } else if (method === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + window.location.href)}`, '_blank');
    } else if (method === 'email') {
        window.open(`mailto:?subject=${encodeURIComponent('Check this out from SAYAND')}&body=${encodeURIComponent(text)}`, '_blank');
    }
    document.getElementById('detail-share-menu').classList.remove('open');
};

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
window.showToast = showToast;

document.getElementById('detail-add-btn').addEventListener('click', () => {
    if (!currentDetailProduct) return;
    
    let sizeMaxQty = 1;
    if (currentDetailProduct.sizeQuantities && currentDetailProduct.sizeQuantities[currentDetailSize] !== undefined) {
        sizeMaxQty = parseInt(currentDetailProduct.sizeQuantities[currentDetailSize]);
    } else {
        sizeMaxQty = currentDetailProduct.quantity !== undefined ? parseInt(currentDetailProduct.quantity) : 1;
    }

    const selectedQty = parseInt(document.getElementById('customer-qty').value) || 1;
    
    const existing = cart.find(item => item.name === currentDetailProduct.name && item.size === currentDetailSize && item.color === currentDetailColor);
    const currentCartQty = existing ? existing.qty : 0;

    if (currentCartQty + selectedQty > sizeMaxQty) {
        alert(`You cannot add more! Only ${sizeMaxQty} available in stock for size ${currentDetailSize}.`);
        return;
    }

    const img = currentDetailProduct.images ? currentDetailProduct.images[0] : currentDetailProduct.img;
    
    if (existing) {
        existing.qty += selectedQty;
    } else {
        cart.push({ 
            name: currentDetailProduct.name, 
            price: currentDetailProduct.salePrice || currentDetailProduct.price, 
            img: img, 
            size: currentDetailSize, 
            color: currentDetailColor, 
            qty: selectedQty,
            maxQty: sizeMaxQty 
        });
    }
    updateCartUI();
    showToast('ADDED TO BAG');
    setTimeout(() => toggleCart(true), 400);
});

// ==================== EDITORIAL, SALES & COLLECTION LOGIC ====================
window.openEditorial = function() {
    const grid = document.getElementById('editorial-grid');
    grid.innerHTML = '';
    
    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
    }
    
    if (allProducts.length === 0) {
        grid.innerHTML = '<p class="text-sm tracking-wide text-gray-500 col-span-full text-center">Collection dropping soon.</p>';
    } else {
        allProducts.forEach((p, index) => {
            const el = document.createElement('div');
            if (index % 4 === 0) {
                el.className = 'group cursor-pointer md:col-span-2 md:row-span-2';
            } else {
                el.className = 'group cursor-pointer';
            }
            el.innerHTML = createProductCardHTML(p, false); 
            grid.appendChild(el);
        });
    }
    
    document.getElementById('editorial-page').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
};

window.closeEditorial = function() {
    document.getElementById('editorial-page').style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
};

window.openSalesPage = function() {
    const salesGrid = document.getElementById('sales-grid');
    const upcomingGrid = document.getElementById('upcoming-sales-grid');
    const activeSection = document.getElementById('sales-active-section');
    const upcomingSection = document.getElementById('sales-upcoming-section');
    
    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
    }
    
    const activeSales = allProducts.filter(p => isSaleActive(p));

    if (activeSales.length === 0) {
        activeSection.style.display = 'none';
    } else {
        activeSection.style.display = 'block';
        salesGrid.innerHTML = activeSales.map(p => {
            const el = document.createElement('div');
            el.className = 'group cursor-pointer';
            el.innerHTML = createProductCardHTML(p, false); 
            return el.outerHTML;
        }).join('');
    }
    
    const upcoming = (typeof SAYAND_PRODUCTS !== 'undefined' && SAYAND_PRODUCTS.upcomingSales) ? SAYAND_PRODUCTS.upcomingSales : [];
    if (upcoming.length === 0) {
        upcomingSection.style.display = 'none';
    } else {
        upcomingSection.style.display = 'block';
        upcomingGrid.innerHTML = upcoming.map(u => `
            <div class="group cursor-pointer">
                <div class="relative aspect-[3/4] overflow-hidden mb-3 bg-gray-100">
                    <img src="${u.image}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
                    <div class="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <span class="text-white text-xs tracking-[0.3em] font-semibold border border-white px-4 py-2">COMING SOON</span>
                    </div>
                </div>
                <h4 class="text-xs font-medium tracking-wide">${u.name}</h4>
                <p class="text-xs text-gray-500 mt-1">${u.category || 'COLLECTION'}</p>
            </div>
        `).join('');
    }
    
    if (activeSales.length === 0 && upcoming.length === 0) {
        salesGrid.parentElement.innerHTML = '<div class="text-center py-20"><p class="text-gray-400 text-sm tracking-wide mb-4">No active sales at the moment.</p><p class="text-gray-300 text-xs">Check back soon for exclusive deals.</p></div>';
    }
    
    document.getElementById('sales-page').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
};
window.closeSalesPage = function() {
    document.getElementById('sales-page').style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
};

window.openCollection = function(categoryFilter, title) {
    document.getElementById('collection-title').innerText = title;
    const collectionGrid = document.getElementById('collection-grid');
    collectionGrid.innerHTML = '';
    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
    }
    const filtered = categoryFilter === 'all' ? allProducts : allProducts.filter(p => p.category === categoryFilter);
    if (filtered.length === 0) {
        collectionGrid.innerHTML = '<p class="text-sm tracking-wide text-gray-500 col-span-full">Products coming soon. Add some via the Admin Dashboard!</p>';
    } else {
        filtered.forEach(p => {
            const el = document.createElement('div');
            el.className = 'group cursor-pointer';
            el.innerHTML = createProductCardHTML(p, false); 
            collectionGrid.appendChild(el);
        });
    }
    document.getElementById('collection-folder').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
};
window.closeCollection = function() {
    document.getElementById('collection-folder').style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
};

document.addEventListener('click', (e) => {
    const shareMenu = document.getElementById('detail-share-menu');
    const shareBtn = document.getElementById('detail-share-btn');
    if (shareMenu && shareMenu.classList.contains('open') && !shareMenu.contains(e.target) && e.target !== shareBtn && !shareBtn.contains(e.target)) {
        shareMenu.classList.remove('open');
    }
});

// ==================== SEARCH FUNCTIONALITY ====================
window.openSearch = function() {
    document.getElementById('search-overlay').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('search-input').focus(), 500);
};

window.closeSearch = function() {
    document.getElementById('search-overlay').style.transform = 'translateY(-100%)';
    document.body.style.overflow = '';
    document.getElementById('search-input').value = '';
    document.getElementById('search-results-grid').innerHTML = '<p class="text-gray-400 text-sm tracking-wide col-span-full">Start typing to search for products...</p>';
};

window.handleSearch = function() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const resultsGrid = document.getElementById('search-results-grid');
    
    if (query.length === 0) {
        resultsGrid.innerHTML = '<p class="text-gray-400 text-sm tracking-wide col-span-full">Start typing to search for products...</p>';
        return;
    }

    let allProducts = [];
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        if (SAYAND_PRODUCTS.newArrivals) allProducts = allProducts.concat(SAYAND_PRODUCTS.newArrivals);
        if (SAYAND_PRODUCTS.trending) allProducts = allProducts.concat(SAYAND_PRODUCTS.trending);
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
        (p.description && p.description.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        resultsGrid.innerHTML = '<p class="text-gray-400 text-sm tracking-wide col-span-full">No products found matching your search.</p>';
    } else {
        resultsGrid.innerHTML = filtered.map(p => {
            const el = document.createElement('div');
            el.className = 'group cursor-pointer';
            el.innerHTML = createProductCardHTML(p, false);
            return el.outerHTML;
        }).join('');
    }
};

// ==================== INFO PAGES & FOOTER LOGIC ====================
const LEGAL_PAGES = ['privacy', 'terms', 'cookie'];

function getFooterPage(page) {
    if (typeof SAYAND_PRODUCTS !== 'undefined' && SAYAND_PRODUCTS && SAYAND_PRODUCTS.footer && SAYAND_PRODUCTS.footer[page]) {
        return SAYAND_PRODUCTS.footer[page];
    }
    return { title: page.toUpperCase(), content: '<p class="text-gray-600">Content loading. Please check your connection.</p>' };
}

window.openInfoPage = function(page) {
    if (LEGAL_PAGES.includes(page)) {
        window.location.href = page + '.html';
        return;
    }
    
    const data = getFooterPage(page);
    if (!data) return;
    
    history.pushState({page: page, overlay: true}, '', '#' + page);
    
    document.getElementById('info-title').innerText = data.title;
    document.getElementById('info-content').innerHTML = data.content;
    document.getElementById('info-page').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
    
    const scrollContainer = document.querySelector('#info-page .overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTop = 0;
};

window.closeInfoPage = function() {
    document.getElementById('info-page').style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
    
    if (window.location.hash) {
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
};

window.addEventListener('popstate', function(e) {
    const hash = window.location.hash.replace('#', '');
    const overlay = document.getElementById('info-page');
    
    if (!hash) {
        overlay.style.transform = 'translateY(100%)';
        document.body.style.overflow = '';
    } else if (!LEGAL_PAGES.includes(hash)) {
        const data = getFooterPage(hash);
        if (data) {
            document.getElementById('info-title').innerText = data.title;
            document.getElementById('info-content').innerHTML = data.content;
            overlay.style.transform = 'translateY(0)';
            document.body.style.overflow = 'hidden';
        }
    }
});

function handleHashRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash && !LEGAL_PAGES.includes(hash)) {
        setTimeout(() => {
            const data = getFooterPage(hash);
            if (data && data.content.includes('Content loading') === false) {
                document.getElementById('info-title').innerText = data.title;
                document.getElementById('info-content').innerHTML = data.content;
                document.getElementById('info-page').style.transform = 'translateY(0)';
                document.body.style.overflow = 'hidden';
            }
        }, 600);
    }
}

// ==================== EMAILJS CONFIG ====================
const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY_HERE'; 
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID_HERE'; 
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID_HERE'; 

(function() {
    if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY_HERE') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }
})();

// ==================== NEWSLETTER SUBSCRIPTION ====================
window.handleSubscribe = function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('subscribe-email');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email || !email.includes('@') || !email.includes('.')) {
        showToast('PLEASE ENTER A VALID EMAIL');
        return;
    }
    
    const subscribeBtn = e.target.querySelector('button[type="submit"]');
    const originalText = subscribeBtn.innerText;
    subscribeBtn.innerText = 'SUBMITTING...';
    subscribeBtn.disabled = true;
    
    if (typeof db === 'undefined') {
        showToast('ERROR: CANNOT CONNECT');
        subscribeBtn.innerText = originalText;
        subscribeBtn.disabled = false;
        return;
    }
    
    db.ref('subscribers').orderByChild('email').equalTo(email).once('value')
    .then((snapshot) => {
        if (snapshot.exists()) {
            showToast('YOU ARE ALREADY SUBSCRIBED!');
            subscribeBtn.innerText = originalText;
            subscribeBtn.disabled = false;
            emailInput.value = '';
            return;
        }
        
        return db.ref('subscribers').push({
            email: email,
            subscribedAt: firebase.database.ServerValue.TIMESTAMP,
            source: window.location.href
        });
    })
    .then(() => {
        showToast('WELCOME TO SAYAND! CHECK YOUR EMAIL');
        emailInput.value = '';
        subscribeBtn.innerText = 'SUBSCRIBED ✓';
        setTimeout(() => {
            subscribeBtn.innerText = originalText;
            subscribeBtn.disabled = false;
        }, 3000);
    })
    .catch((err) => {
        console.error('Subscribe error:', err);
        showToast('ERROR: PLEASE TRY AGAIN');
        subscribeBtn.innerText = originalText;
        subscribeBtn.disabled = false;
    });
};

// ==================== SCROLL RESET ON LOAD ====================
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

// ==================== SHOPPING BAG UI TOGGLES ====================
const cartSidebar = document.getElementById('shopping-bag');
const cartOverlay = document.getElementById('cart-overlay');

function toggleCart(open) {
    if(cartSidebar) cartSidebar.style.transform = open ? 'translateX(0)' : 'translateX(100%)';
    if(cartOverlay) {
        cartOverlay.classList.toggle('hidden', !open);
        setTimeout(() => cartOverlay.classList.toggle('opacity-0', !open), 10);
    }
}

const cartToggleBtn = document.getElementById('cart-toggle');
if(cartToggleBtn) cartToggleBtn.addEventListener('click', (e) => { e.preventDefault(); toggleCart(true); });

const closeCartBtn = document.getElementById('close-cart');
if(closeCartBtn) closeCartBtn.addEventListener('click', () => toggleCart(false));

if(cartOverlay) cartOverlay.addEventListener('click', () => toggleCart(false));

// ==================== FIREBASE: ADD TO BAG ====================
const addToBagBtn = document.getElementById('detail-add-btn');

if (addToBagBtn) {
    addToBagBtn.addEventListener('click', () => {
        const user = firebase.auth().currentUser;

        if (!user) {
            alert("Please log in to add items to your bag.");
            window.location.href = "login.html";
            return;
        }

        const productName = document.getElementById('detail-name').innerText;
        const productPriceStr = document.getElementById('detail-price').innerText;
        const productQty = parseInt(document.getElementById('customer-qty').value) || 1;
        const productImage = document.getElementById('detail-hero-img').src;

        let size = 'OS';
        const sizeBtns = document.querySelectorAll('#detail-sizes .size-option');
        sizeBtns.forEach(btn => {
            if (btn.classList.contains('selected')) {
                size = btn.querySelector('.text-sm').innerText; 
            }
        });

        const colorElement = document.getElementById('detail-color');
        const color = colorElement && colorElement.innerText ? colorElement.innerText : 'Default';

        const stockText = document.getElementById('detail-stock').innerText;
        const maxStock = parseInt(stockText.replace(/[^0-9]/g, '')) || 10; 

        const numericPrice = parseFloat(productPriceStr.replace(/[^0-9.]/g, ''));
        const itemKey = `${productName}_${size}_${color}`.replace(/[^a-zA-Z0-9]/g, '_');
        const itemRef = firebase.database().ref(`users/${user.uid}/cart/${itemKey}`);

        itemRef.once('value').then((snapshot) => {
            if (snapshot.exists()) {
                const currentQty = snapshot.val().quantity;
                if (currentQty + productQty > maxStock) {
                    alert(`Sorry, only ${maxStock} in stock for this size!`);
                    return;
                }
                itemRef.update({ quantity: currentQty + productQty });
            } else {
                if (productQty > maxStock) {
                    alert(`Sorry, only ${maxStock} in stock for this size!`);
                    return;
                }
                itemRef.set({
                    name: productName,
                    price: numericPrice,
                    quantity: productQty,
                    maxStock: maxStock, 
                    image: productImage,
                    size: size,
                    color: color,
                    addedAt: firebase.database.ServerValue.TIMESTAMP
                });
            }

            const toast = document.getElementById('toast');
            if (toast) {
                toast.innerText = 'ADDED TO BAG';
                toast.style.display = 'block'; 
                toast.style.animation = 'fadeIn 0.3s ease-in, fadeOut 0.3s ease-out 2.7s';
                setTimeout(() => { toast.style.display = 'none'; }, 3000);
            }
            toggleCart(true); 
        });
    });
}

// ==================== FIREBASE: FETCH & DISPLAY CART ====================
firebase.auth().onAuthStateChanged((user) => {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCountBadge = document.getElementById('cart-count');
    const cartTotalDisplay = document.getElementById('cart-total');

    if (user) {
        const cartRef = firebase.database().ref(`users/${user.uid}/cart`);
        
        cartRef.on('value', (snapshot) => {
            const cartData = snapshot.val();
            
            if (cartData) {
                let totalItems = 0;
                let totalPrice = 0;
                let html = '';

                Object.keys(cartData).forEach(key => {
                    const item = cartData[key];
                    totalItems += item.quantity;
                    totalPrice += (item.price * item.quantity);
                    
                    const safeName = item.name.replace(/'/g, "\\'");

                    html += `
                        <div class="flex relative border-b border-gray-100 pb-6 mb-6">
                            <img src="${item.image}" alt="${item.name}" class="w-20 h-28 object-cover cursor-pointer hover:opacity-80 transition-opacity" onclick="goToProduct('${safeName}')">
                            
                            <div class="flex-1 ml-4 flex flex-col justify-between">
                                <div>
                                    <h4 class="text-xs tracking-[0.1em] font-bold uppercase cursor-pointer hover:text-gray-500 transition-colors w-11/12" onclick="goToProduct('${safeName}')">${item.name}</h4>
                                    <p class="text-[10px] text-gray-500 mt-1 uppercase">SIZE: ${item.size} | COLOR: ${item.color}</p>
                                    
                                    <div class="inline-flex items-center mt-3 border border-gray-300 bg-transparent text-gray-600">
                                        <button onclick="updateCartQty('${key}', -1)" class="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors">-</button>
                                        <span class="w-8 h-8 flex items-center justify-center text-xs font-medium border-x border-gray-300">${item.quantity}</span>
                                        <button onclick="updateCartQty('${key}', 1)" class="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors">+</button>
                                    </div>
                                </div>
                                
                                <p class="text-xs font-bold mt-3">$${(item.price * item.quantity).toFixed(2)} USD</p>
                            </div>
                            
                            <button onclick="removeFromBag('${key}')" class="absolute top-0 right-0 text-gray-400 hover:text-black text-xl leading-none">&times;</button>
                        </div>
                    `;
                });

                if(cartItemsContainer) cartItemsContainer.innerHTML = html;
                if(cartCountBadge) { cartCountBadge.textContent = totalItems; cartCountBadge.classList.remove('hidden'); }
                if(cartTotalDisplay) cartTotalDisplay.textContent = `$${totalPrice.toFixed(2)} USD`;

            } else {
                if(cartItemsContainer) cartItemsContainer.innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Your bag is currently empty.</p>';
                if(cartCountBadge) cartCountBadge.classList.add('hidden');
                if(cartTotalDisplay) cartTotalDisplay.textContent = '$0.00 USD';
            }
        });
    } else {
        if(cartItemsContainer) cartItemsContainer.innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Please sign in to view your bag.</p>';
        if(cartCountBadge) cartCountBadge.classList.add('hidden');
        if(cartTotalDisplay) cartTotalDisplay.textContent = '$0.00 USD';
    }
});

// ==================== FIREBASE: CART HELPERS ====================
window.updateCartQty = function(itemKey, change) {
    const user = firebase.auth().currentUser;
    if (user) {
        const itemRef = firebase.database().ref(`users/${user.uid}/cart/${itemKey}`);
        itemRef.once('value').then(snapshot => {
            if(snapshot.exists()) {
                const itemData = snapshot.val();
                let newQty = itemData.quantity + change;
                
                if (newQty < 1) { return; }

                if (newQty > itemData.maxStock) {
                    alert(`Sorry, only ${itemData.maxStock} in stock!`);
                    return;
                }

                itemRef.update({ quantity: newQty }); 
            }
        });
    }
};

window.removeFromBag = function(itemKey) {
    const user = firebase.auth().currentUser;
    if (user) {
        firebase.database().ref(`users/${user.uid}/cart/${itemKey}`).remove();
    }
};

// Handle clicking an item in the bag to view the REAL product page
window.goToProduct = function(productName) {
    toggleCart(false); // Close the bag
    
    let foundProduct = null;
    
    if (typeof SAYAND_PRODUCTS !== 'undefined') {
        // Dynamically search EVERY category array in your database
        // (New Arrivals, Trending, Sales, Men, Women, Accessories, etc.)
        for (const key in SAYAND_PRODUCTS) {
            if (Array.isArray(SAYAND_PRODUCTS[key])) {
                // Ignore uppercase/lowercase differences just to be safe
                const match = SAYAND_PRODUCTS[key].find(p => p.name && p.name.toLowerCase() === productName.toLowerCase());
                if (match) {
                    foundProduct = match;
                    break; // Stop searching once we find it!
                }
            }
        }
    }
    
    if (foundProduct) {
        // We found it! Send it to the main Detail rendering function
        const encoded = encodeURIComponent(JSON.stringify(foundProduct));
        openProductDetail(encoded);
    } else {
        alert("Sorry, we couldn't load the details for this product.");
    }
};

// ==================== WHATSAPP CHECKOUT ====================
const whatsappBtn = document.getElementById('whatsapp-checkout-btn');
if(whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
        const user = firebase.auth().currentUser;
        if (!user) {
            alert("Please sign in to proceed to checkout.");
            return;
        }

        firebase.database().ref(`users/${user.uid}/cart`).once('value').then(snapshot => {
            const cartData = snapshot.val();
            if (!cartData) {
                alert("Your bag is empty!");
                return;
            }

            let orderMessage = "Hi! I'd like to order the following from SAYAND:\n\n";
            let total = 0;

            Object.values(cartData).forEach(item => { 
                orderMessage += `- ${item.quantity}x ${item.name} ($${(item.price * item.quantity).toFixed(2)})\n  Size: ${item.size}\n  Color: ${item.color}\n\n`; 
                total += (item.price * item.quantity);
            });

            orderMessage += `Total: $${total.toFixed(2)} USD\n\nPlease let me know how to pay!`;
            
            const waNum = CONTACT.whatsapp ? CONTACT.whatsapp.replace(/\+/g, '') : '393299716798';
            const whatsappUrl = `https://wa.me/${waNum}?text=${encodeURIComponent(orderMessage)}`;
            window.open(whatsappUrl, '_blank');
        });
    });
}
