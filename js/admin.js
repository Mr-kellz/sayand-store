let database = { siteContent: {}, contact: { email: 'thesayand0@gmail.com', whatsapp: '+393299716798', instagram: 'https://instagram.com/thesayand_', tiktok: 'https://tiktok.com/@thesayand_', pinterest: 'https://pinterest.com/thesayand_' }, newArrivals: [], trending: [], upcomingSales: [], footer: {} };let editingTarget = null;
let uploadedImages = [];
let measurementRows = [];

// ==================== NOTIFICATION TOAST ====================
function showAdminToast(message) {
    const toast = document.getElementById('admin-toast');
    const toastText = document.getElementById('admin-toast-text');
    toastText.innerText = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}

// ==================== FETCH FIREBASE DATA ON LOAD ====================
db.ref("mainStore").once("value").then((snapshot) => {
    if(snapshot.exists()) {
        const data = snapshot.val();
        if(data.siteContent) database.siteContent = data.siteContent;
        if(data.contact) database.contact = data.contact;
        if(data.newArrivals) database.newArrivals = data.newArrivals;
        if(data.trending) database.trending = data.trending;
        if(data.upcomingSales) database.upcomingSales = data.upcomingSales;
        if(data.footer) database.footer = data.footer;
        
        initFooterDefaults();
        renderLists();
        loadDesignForm();
        loadContactForm();
    } else {
        initFooterDefaults();
    }
});

// ==================== AI DESCRIPTION GENERATOR ====================
// PUT YOUR FRESH GEMINI API KEY RIGHT HERE INSIDE THE QUOTES:
const GEMINI_API_KEY = 'YOUR_NEW_API_KEY_HERE'; 

window.generateAIDescription = async function() {
    const descBox = document.getElementById('prodDesc');
    const aiBtn = document.getElementById('aiDescBtn');
    const name = document.getElementById('prodName').value;
    const category = document.getElementById('prodCategory').value;

    if(GEMINI_API_KEY === 'YOUR_NEW_API_KEY_HERE' || !GEMINI_API_KEY.startsWith('AIza')) {
        alert("Oops! Your Gemini API key looks invalid. Please get a valid key from Google AI Studio.");
        return;
    }

    let imageBase64 = '';
    if (uploadedImages.length > 0) {
        imageBase64 = uploadedImages[0];
    } else {
        alert("Please UPLOAD an image from your device first so the AI can see it!");
        return;
    }

    try {
        aiBtn.innerText = "â³ GENERATING...";
        aiBtn.disabled = true;

        // Clean the image data to send to the AI
        const base64Data = imageBase64.split(',')[1];
        
        // This tells the AI what to do!
        const promptText = `Write a short, engaging, and premium product description for an e-commerce fashion store called SAYAND. The product is named "${name}" and is in the "${category}" category. Look at the image provided and describe the style, texture, and vibe of the clothing. Keep it under 3 sentences. No hashtags.`;

        const requestBody = {
            contents: [{ 
                parts: [ 
                    { text: promptText }, 
                    { inlineData: { mimeType: "image/jpeg", data: base64Data } } 
                ] 
            }]
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error Details:", data);
            alert(`API Error: ${data.error?.message || "Check the browser console for details."}`);
            return;
        }

        if (data.candidates && data.candidates.length > 0) {
            descBox.value = data.candidates[0].content.parts[0].text.trim();
            showAdminToast("âœ¨ AI DESCRIPTION GENERATED!");
        } else {
            alert("AI could not generate a description. Try uploading the image again.");
        }

    } catch (error) {
        console.error("Fetch error:", error);
        alert("Error connecting to AI. Check your internet connection or console logs.");
    } finally {
        aiBtn.innerText = "âœ¨ AI GENERATE";
        aiBtn.disabled = false;
    }
}

// ==================== AUTO-CALCULATE PERCENTAGE ====================
window.calculateSalePercent = function() {
    const originalPrice = parseFloat(document.getElementById('saleOriginalPrice').value.replace('$', ''));
    const salePrice = parseFloat(document.getElementById('salePriceInput').value);
    const percentInput = document.getElementById('salePercentInput');
    
    if (originalPrice && salePrice && salePrice < originalPrice) {
        const discount = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
        percentInput.value = discount;
    } else {
        percentInput.value = '';
    }
};

// ==================== TABS ====================
function switchTab(tab) {
    document.querySelectorAll('[id^="section-"]').forEach(el => el.style.display = 'none');
    document.getElementById(`section-${tab}`).style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if(tab === 'sales') { renderSalesList(); renderUpcomingList(); populateSaleSelect(); }
if(tab === 'design') loadDesignForm();
if(tab === 'contact') loadContactForm();
if(tab === 'footer') loadFooterForm();
if(tab === 'subscribers') loadSubscribers();
}

// ==================== COLLAPSIBLE ====================
window.toggleCollapsible = function(id, btn) {
    const el = document.getElementById(id);
    const icon = btn.querySelector('.collapsible-icon');
    el.classList.toggle('open');
    icon.style.transform = el.classList.contains('open') ? 'rotate(45deg)' : 'rotate(0deg)';
}

// ==================== SIZE / INVENTORY ROWS ====================
window.addSizeRow = function(size = '', qty = 0) {
    const container = document.getElementById('sizes-inputs');
    const rowId = 'size-row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.id = rowId;
    div.className = 'flex gap-2 items-center';
    div.innerHTML = `
        <input type="text" placeholder="Size (e.g. M)" value="${size}" class="size-name w-1/2 border border-gray-300 p-2 text-xs focus:outline-none focus:border-black uppercase">
        <input type="number" placeholder="Qty" value="${qty}" min="0" class="size-qty w-1/3 border border-gray-300 p-2 text-xs focus:outline-none focus:border-black">
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="text-red-400 hover:text-red-600 text-xs font-bold px-2">&times;</button>
    `;
    container.appendChild(div);
}

// ==================== MEASUREMENT ROWS ====================
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

// ==================== IMAGE UPLOAD ====================
function resizeImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let scale = maxWidth / img.width;
                if (scale > 1) scale = 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            }
            img.src = event.target.result;
        }
        reader.readAsDataURL(file);
    });
}

document.getElementById('prodImageFile').addEventListener('change', async function(e) {
    uploadedImages = [];
    const files = Array.from(e.target.files);
    if(files.length === 0) return;
    const preview = document.getElementById('uploaded-preview');
    preview.innerHTML = '';
    
    for (const file of files) {
        const dataUrl = await resizeImage(file, 800, 0.75);
        uploadedImages.push(dataUrl);
        const thumb = document.createElement('div');
        thumb.className = 'w-12 h-16 border border-gray-200 overflow-hidden flex-shrink-0';
        thumb.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover">`;
        preview.appendChild(thumb);
    }
    document.getElementById('prodImgUrl').value = '';
});

document.getElementById('prodImgUrl').addEventListener('input', function() {
    if(this.value.length > 0) {
        document.getElementById('prodImageFile').value = '';
        uploadedImages = [];
        document.getElementById('uploaded-preview').innerHTML = '';
    }
});

window.handleDesignImageUpload = async function(e, targetId) {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await resizeImage(file, 1200, 0.8);
    document.getElementById(targetId).value = dataUrl;
    updateDesign();
}
// ==================== ADD / EDIT PRODUCT ====================
document.getElementById('addProductForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const section = document.getElementById('prodSection').value;
    const category = document.getElementById('prodCategory').value;
    const name = document.getElementById('prodName').value.toUpperCase();
    const price = parseFloat(document.getElementById('prodPrice').value);
    const description = document.getElementById('prodDesc').value;
    const isOutOfStock = document.getElementById('prodOutOfStock').checked;
    
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
        name, price, description, isOutOfStock,
        quantity: totalQty, 
        images: finalImages, 
        category,
        sizes: rawSizes,
        sizeQuantities: sizeQuantities,
        colors: rawColors.length > 0 ? rawColors : ['Default']
    };
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

// ==================== EDIT ====================
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
    if(document.getElementById('prodOutOfStock')) document.getElementById('prodOutOfStock').checked = !!item.isOutOfStock;
    
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
    uploadedImages = [];
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

// ==================== SALES MANAGEMENT (NO DUPLICATES) ====================
function populateSaleSelect() {
    const select = document.getElementById('saleProductSelect');
    let allProducts = [...(database.newArrivals||[]), ...(database.trending||[])];
    const notOnSale = allProducts.filter(p => !p.salePrice);
    
    select.innerHTML = '<option value="">-- Select a product --</option>' +
        notOnSale.map(p => `<option value="${p.name}" data-price="${p.price}">${p.name} ($${p.price})</option>`).join('');
    
    select.onchange = function() {
        const opt = this.options[this.selectedIndex];
        document.getElementById('saleOriginalPrice').value = opt.dataset.price ? '$' + opt.dataset.price : '';
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
        if (saleEndDate) {
            database[foundSection][foundIndex].saleEndDate = saleEndDate;
        }
        
        document.getElementById('salePriceInput').value = '';
        document.getElementById('salePercentInput').value = '';
        document.getElementById('saleOriginalPrice').value = '';
        document.getElementById('saleEndDateInput').value = '';
        populateSaleSelect();
        renderSalesList();
        renderLists();
        generateCode();
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
            
            populateSaleSelect();
            renderSalesList();
            renderLists();
            generateCode();
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
                <p class="text-[10px] text-red-600">$${s.salePrice} <span class="text-gray-400 line-through">$${s.originalPrice || s.price}</span> (-${s.salePercent}%)</p>
                ${s.saleEndDate ? `<p class="text-[8px] text-gray-500 mt-1">Ends: ${new Date(s.saleEndDate).toLocaleString()}</p>` : ''}
            </div>
            <button onclick="removeFromSales('${s.name}')" class="text-red-500 hover:text-red-700 text-[10px] font-bold px-2">REMOVE</button>
        </div>`;
    }).join('');
}

// ==================== UPCOMING SALES ====================
let upcomingImageData = '';
document.getElementById('upcomingImageFile').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    upcomingImageData = await resizeImage(file, 800, 0.75);
});

window.addUpcomingSale = function() {
    const name = document.getElementById('upcomingName').value.trim();
    const url = document.getElementById('upcomingImageUrl').value.trim();
    const category = document.getElementById('upcomingCategory').value;
    
    const image = url || upcomingImageData;
    if (!name || !image) return alert("Please provide a name and image.");
    
    database.upcomingSales.push({ name, image, category });
    document.getElementById('upcomingName').value = '';
    document.getElementById('upcomingImageUrl').value = '';
    document.getElementById('upcomingImageFile').value = '';
    upcomingImageData = '';
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
    container.innerHTML = database.upcomingSales.map((u, i) => `
        <div class="flex items-center gap-3 p-2 bg-gray-50 border border-gray-100">
            <img src="${u.image}" class="w-10 h-14 object-cover flex-shrink-0">
            <div class="flex-1 min-w-0">
                <p class="text-[10px] font-bold truncate">${u.name}</p>
                <p class="text-[10px] text-gray-400">${u.category}</p>
            </div>
            <button onclick="removeUpcomingSale(${i})" class="text-red-500 hover:text-red-700 text-[10px] font-bold px-2">REMOVE</button>
        </div>
    `).join('');
}

// ==================== DESIGN TAB ====================
function loadDesignForm() {
    const sc = database.siteContent;
    document.getElementById('heroSubtitle').value = sc.heroSubtitle || '';
    document.getElementById('heroTitle').value = sc.heroTitle || '';
    document.getElementById('heroImg').value = sc.heroImg || '';
    document.getElementById('womenImg').value = sc.womenImg || '';
    document.getElementById('menImg').value = sc.menImg || '';
    document.getElementById('accImg').value = sc.accImg || '';
    document.getElementById('editSubtitle').value = sc.editSubtitle || '';
    document.getElementById('editTitle').value = sc.editTitle || '';
    document.getElementById('editDesc').value = sc.editDesc || '';
    document.getElementById('editImg').value = sc.editImg || '';
}

window.updateDesign = function() {
    database.siteContent = {
        heroSubtitle: document.getElementById('heroSubtitle').value,
        heroTitle: document.getElementById('heroTitle').value,
        heroImg: document.getElementById('heroImg').value,
        womenImg: document.getElementById('womenImg').value,
        menImg: document.getElementById('menImg').value,
        accImg: document.getElementById('accImg').value,
        editSubtitle: document.getElementById('editSubtitle').value,
        editTitle: document.getElementById('editTitle').value,
        editDesc: document.getElementById('editDesc').value,
        editImg: document.getElementById('editImg').value
    };
    generateCode();
}

// ==================== CONTACT TAB ====================
function loadContactForm() {
    const c = database.contact;
    document.getElementById('contactEmail').value = c.email || '';
    document.getElementById('contactWhatsapp').value = c.whatsapp || '';
    document.getElementById('contactInstagram').value = c.instagram || '';
    document.getElementById('contactTiktok').value = c.tiktok || '';
    document.getElementById('contactPinterest').value = c.pinterest || '';
}

window.updateContact = function() {
    database.contact = {
        email: document.getElementById('contactEmail').value,
        whatsapp: document.getElementById('contactWhatsapp').value,
        instagram: document.getElementById('contactInstagram').value,
        tiktok: document.getElementById('contactTiktok').value,
        pinterest: document.getElementById('contactPinterest').value
    };
    generateCode();
}

// ==================== INVENTORY LISTS ====================
function renderInventorySection(containerId, items, sectionName) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-gray-400 italic">No items.</p>';
        return;
    }
    items.forEach((item, index) => {
        const thumbImg = item.images ? item.images[0] : item.img;
        const hasDetails = item.details ? 'âœ“' : '';
        const hasMeas = item.measurements ? 'âš¡' : '';
        const oosBadge = (item.isOutOfStock || item.quantity <= 0) ? `<span class="bg-red-100 text-red-600 px-1 rounded text-[8px] ml-1">OOS</span>` : '';
        const div = document.createElement('div');
        div.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors gap-2';
        div.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <img src="${thumbImg}" class="w-10 h-14 object-cover bg-gray-200 flex-shrink-0">
                <div class="min-w-0">
                    <p class="text-[10px] font-bold truncate">${item.name} <span class="text-gray-400 font-normal">${hasDetails}${hasMeas}</span>${oosBadge}</p>
                    <p class="text-[9px] text-gray-400 uppercase tracking-widest">${item.category || 'N/A'}</p>
                    <p class="text-[10px] text-gray-500">$${item.salePrice || item.price}</p>
                </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
                <button onclick="startEdit('${sectionName}', ${index})" class="text-blue-500 hover:text-blue-700 text-[9px] font-bold tracking-wider px-2 py-1 border border-blue-500 hover:bg-blue-50">EDIT</button>
                <button onclick="removeItem('${sectionName}', ${index})" class="text-red-500 hover:text-red-700 text-[9px] font-bold tracking-wider px-2 py-1 border border-red-500 hover:bg-red-50">DEL</button>
            </div>`;
        container.appendChild(div);
    });
}

function renderLists() {
    renderInventorySection('list-newArrivals', database.newArrivals, 'newArrivals');
    renderInventorySection('list-trending', database.trending, 'trending');
    
    const upContainer = document.getElementById('list-upcoming');
    if (!database.upcomingSales || database.upcomingSales.length === 0) {
        upContainer.innerHTML = '<p class="text-[10px] text-gray-400 italic">No teasers.</p>';
    } else {
        upContainer.innerHTML = database.upcomingSales.map((u, i) => `
            <div class="flex items-center gap-3 p-2 bg-gray-50 border border-gray-100">
                <img src="${u.image}" class="w-8 h-10 object-cover flex-shrink-0">
                <div class="flex-1 min-w-0">
                    <p class="text-[10px] font-bold truncate">${u.name}</p>
                    <p class="text-[9px] text-gray-400">${u.category}</p>
                </div>
                <button onclick="removeUpcomingSale(${i})" class="text-red-500 hover:text-red-700 text-[9px] font-bold px-1">&times;</button>
            </div>
        `).join('');
    }
}

// ==================== CODE GENERATION (AND CLOUD SAVE) ====================
window.generateCode = function() {
    // Automatically Save to Firebase when a change is made
    db.ref("mainStore").set(database)
        .then(() => {
            console.log("Cloud Sync Successful! Your store is updated.");
            
            if(typeof showAdminToast === 'function') {
                showAdminToast("LIVE STORE UPDATED!");
            }
        })
        .catch((error) => {
            alert("Error saving to cloud: " + error.message);
        });
}
// ==================== FOOTER CONTENT MANAGEMENT ====================
const DEFAULT_FOOTER_PAGES = {
    shipping: { title: "SHIPPING INFO", content: `<div class="space-y-6"><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">STANDARD DELIVERY</h4><p class="text-gray-600">Free standard shipping on all orders over $150. Delivery within 3-5 business days. Orders are processed within 24 hours during business days.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">EXPRESS DELIVERY</h4><p class="text-gray-600">Available for select locations. Delivery within 1-2 business days. Flat rate of $25.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">INTERNATIONAL SHIPPING</h4><p class="text-gray-600">We ship worldwide via DHL Express. International orders typically arrive within 5-10 business days. Customs duties and taxes may apply and are the responsibility of the customer.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">TRACKING</h4><p class="text-gray-600">Once your order ships, you will receive an email with a tracking number.</p></div></div>` },
    returns: { title: "RETURNS & EXCHANGES", content: `<div class="space-y-6"><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">RETURN POLICY</h4><p class="text-gray-600">We accept returns within 30 days of purchase. Items must be in original condition with all tags attached and in original packaging. Sale items are final sale unless defective.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">HOW TO RETURN</h4><p class="text-gray-600">1. Log into your account and select the order you wish to return.<br>2. Print the prepaid return label (free for orders over $100).<<br>3. Pack the item securely and attach the label.<br>4. Drop off at any authorized shipping location.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">REFUNDS</h4><p class="text-gray-600">Refunds are processed within 5-7 business days after we receive your return. Original shipping charges are non-refundable.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">EXCHANGES</h4><p class="text-gray-600">For size exchanges, we recommend placing a new order for the correct size and returning the original item for a refund.</p></div></div>` },
    size: { title: "SIZE GUIDE", content: `<div class="space-y-6"><p class="text-gray-600">Our garments are designed with a contemporary fit. If you are between sizes, we recommend sizing up for an oversized look or down for a more fitted silhouette.</p><div class="overflow-x-auto"><table class="w-full text-sm text-left border border-gray-200"><thead class="bg-gray-50 text-xs tracking-wider font-bold"><tr><th class="p-3 border-b">SIZE</th><th class="p-3 border-b">CHEST</th><th class="p-3 border-b">WAIST</th><th class="p-3 border-b">LENGTH</th></tr></thead><tbody class="text-gray-600"><tr><td class="p-3 border-b">XS</td><td class="p-3 border-b">92cm / 36in</td><td class="p-3 border-b">76cm / 30in</td><td class="p-3 border-b">68cm / 27in</td></tr><tr><td class="p-3 border-b">S</td><td class="p-3 border-b">96cm / 38in</td><td class="p-3 border-b">80cm / 31.5in</td><td class="p-3 border-b">70cm / 27.5in</td></tr><tr><td class="p-3 border-b">M</td><td class="p-3 border-b">100cm / 39in</td><td class="p-3 border-b">84cm / 33in</td><td class="p-3 border-b">72cm / 28in</td></tr><tr><td class="p-3 border-b">L</td><td class="p-3 border-b">104cm / 41in</td><td class="p-3 border-b">88cm / 34.5in</td><td class="p-3 border-b">74cm / 29in</td></tr><tr><td class="p-3 border-b">XL</td><td class="p-3 border-b">108cm / 42.5in</td><td class="p-3 border-b">92cm / 36in</td><td class="p-3 border-b">76cm / 30in</td></tr></tbody></table></div><p class="text-gray-600 text-xs">Measurements may vary slightly by style. Check individual product pages for specific measurements.</p></div>` },
    about: { title: "ABOUT US", content: `<div class="space-y-6"><p class="text-gray-600">SAYAND is a contemporary fashion label founded on the principle that less is always more. We design modern essentials for the discerning individual who values quality over quantity.</p><p class="text-gray-600">Every piece in our collection is meticulously crafted using premium materials and precision cutting techniques. We believe in creating garments that transcend seasons, not chase them.</p><p class="text-gray-600">Our design studio is based in Milan, with production partners in Italy and Portugal who share our commitment to ethical manufacturing and sustainable practices.</p></div>` },
    careers: { title: "CAREERS", content: `<div class="space-y-6"><p class="text-gray-600">Join the SAYAND team. We are always looking for passionate individuals who share our vision for modern, minimalist fashion.</p><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">CURRENT OPENINGS</h4><ul class="space-y-3 text-gray-600"><li class="border-b border-gray-100 pb-3"><strong>Junior Fashion Designer</strong> — Milan, Italy<br><span class="text-xs text-gray-400">Full-time</span></li><li class="border-b border-gray-100 pb-3"><strong>E-Commerce Manager</strong> — Remote<br><span class="text-xs text-gray-400">Full-time</span></li><li class="border-b border-gray-100 pb-3"><strong>Customer Experience Specialist</strong> — Remote<br><span class="text-xs text-gray-400">Part-time</span></li></ul></div><p class="text-gray-600">Send your portfolio and CV to <a href="mailto:careers@sayand.com" class="underline hover:text-black">careers@sayand.com</a></p></div>` },
    sustainability: { title: "SUSTAINABILITY", content: `<div class="space-y-6"><p class="text-gray-600">At SAYAND, we are committed to reducing our environmental footprint while maintaining the highest standards of quality and design.</p><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">OUR COMMITMENTS</h4><ul class="list-disc list-inside space-y-2 text-gray-600"><li>100% of our cotton is organic or recycled</li><li>All packaging is plastic-free and fully recyclable</li><li>Carbon-neutral shipping on all orders</li><li>Made-to-order capsule collections to reduce waste</li><li>Partnership with textile recycling programs</li></ul></div><p class="text-gray-600">We believe sustainability is a journey, not a destination. We are constantly evaluating our supply chain to identify new opportunities for improvement.</p></div>` },
    press: { title: "PRESS", content: `<div class="space-y-6"><p class="text-gray-600">For press inquiries, image requests, and collaboration proposals, please contact our communications team.</p><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">PRESS CONTACT</h4><p class="text-gray-600">Email: <a href="mailto:press@sayand.com" class="underline hover:text-black">press@sayand.com</a><br>Instagram: @sayand_press</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">RECENT FEATURES</h4><ul class="space-y-3 text-gray-600"><li class="border-b border-gray-100 pb-3"><em>Vogue Italia</em> — "The New Minimalists" <span class="text-gray-400 text-xs">March 2026</span></li><li class="border-b border-gray-100 pb-3"><em>Highsnobiety</em> — "Essential Modernity" <span class="text-gray-400 text-xs">February 2026</span></li><li class="border-b border-gray-100 pb-3"><em>WWD</em> — "SAYAND's Quiet Luxury" <span class="text-gray-400 text-xs">January 2026</span></li></ul></div></div>` },
    privacy: { title: "PRIVACY POLICY", content: `<div class="space-y-6 text-gray-600"><p>Last updated: June 2026</p><p>SAYAND respects your privacy and is committed to protecting your personal data. This policy explains how we collect, use, and safeguard your information.</p><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">1. INFORMATION WE COLLECT</h4><p>We collect personal information you provide directly (name, email, shipping address, payment details) and technical data automatically (IP address, browser type, device information).</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">2. HOW WE USE YOUR DATA</h4><p>Your data is used to process orders, communicate with you, improve our services, and send marketing communications (if you have opted in). We do not sell your personal data to third parties.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">3. YOUR RIGHTS</h4><p>You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at <a href="mailto:privacy@sayand.com" class="underline hover:text-black">privacy@sayand.com</a>.</p></div></div>` },
    terms: { title: "TERMS OF USE", content: `<div class="space-y-6 text-gray-600"><p>By accessing and using the SAYAND website, you accept and agree to be bound by these terms and conditions.</p><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">ORDERS & PAYMENT</h4><p>All prices are listed in USD and include VAT where applicable. We reserve the right to refuse or cancel any order for any reason. Payment must be received before items are shipped.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">INTELLECTUAL PROPERTY</h4><p>All content on this website, including images, text, and designs, is the property of SAYAND and is protected by copyright and trademark laws. Unauthorized use is strictly prohibited.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">LIABILITY</h4><p>SAYAND is not liable for any indirect, incidental, or consequential damages arising from the use of our products or website. Our liability is limited to the purchase price of the item.</p></div></div>` },
    cookie: { title: "COOKIE POLICY", content: `<div class="space-y-6 text-gray-600"><p>SAYAND uses cookies and similar technologies to enhance your browsing experience and analyze site traffic.</p><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">WHAT ARE COOKIES?</h4><p>Cookies are small text files stored on your device when you visit a website. They help us remember your preferences and understand how you interact with our site.</p></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">TYPES OF COOKIES WE USE</h4><ul class="list-disc list-inside space-y-2"><li><strong>Essential:</strong> Required for the website to function properly.</li><li><strong>Analytics:</strong> Help us understand how visitors interact with our site.</li><li><strong>Marketing:</strong> Used to deliver relevant advertisements and track their performance.</li></ul></div><div><h4 class="text-black font-bold text-sm tracking-wider mb-2">MANAGING COOKIES</h4><p>You can manage or disable cookies through your browser settings. Please note that disabling certain cookies may affect the functionality of the website.</p></div></div>` }
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
            <p class="text-[9px] text-gray-400 mt-1 font-mono">KEY: ${key}</p>
        `;
        container.appendChild(div);
    });
}

window.updateFooter = function(key) {
    const titleInput = document.querySelector(`.footer-title[data-key="${key}"]`);
    const contentInput = document.querySelector(`.footer-content[data-key="${key}"]`);
    if (titleInput && contentInput) {
        database.footer[key] = { title: titleInput.value, content: contentInput.value };
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
// ==================== SUBSCRIBERS MANAGEMENT ====================
function loadSubscribers() {
    const tbody = document.getElementById('subscribers-list');
    const emptyMsg = document.getElementById('subscribers-empty');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    db.ref("subscribers").once("value").then((snapshot) => {
        if (!snapshot.exists()) {
            emptyMsg.style.display = 'block';
            return;
        }
        
        emptyMsg.style.display = 'none';
        const subscribers = [];
        snapshot.forEach((child) => {
            subscribers.push({ id: child.key, ...child.val() });
        });
        
        // Sort by date, newest first
        subscribers.sort((a, b) => new Date(b.subscribedAt) - new Date(a.subscribedAt));
        
        subscribers.forEach((sub) => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-100 hover:bg-gray-50';
            const date = sub.subscribedAt ? new Date(sub.subscribedAt).toLocaleDateString() : 'N/A';
            row.innerHTML = `
                <td class="p-3 font-mono text-[10px]">${sub.email}</td>
                <td class="p-3 text-gray-500">${date}</td>
                <td class="p-3 text-right">
                    <button onclick="deleteSubscriber('${sub.id}')" class="text-red-500 hover:text-red-700 text-[9px] font-bold">DELETE</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    });
}

window.deleteSubscriber = function(id) {
    if (!confirm('Delete this subscriber?')) return;
    db.ref("subscribers/" + id).remove()
        .then(() => {
            showAdminToast('SUBSCRIBER DELETED');
            loadSubscribers();
        })
        .catch((err) => alert('Error: ' + err.message));
};

window.exportSubscribers = function() {
    db.ref("subscribers").once("value").then((snapshot) => {
        if (!snapshot.exists()) {
            alert('No subscribers to export.');
            return;
        }
        
        let csv = 'Email,Subscribed Date,Source\n';
        snapshot.forEach((child) => {
            const sub = child.val();
            csv += `"${sub.email}","${sub.subscribedAt || ''}","${sub.source || ''}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sayand_subscribers_' + new Date().toISOString().split('T')[0] + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showAdminToast('CSV EXPORTED!');
    });
    // ==================== NOTIFY SUBSCRIBERS (NEW ARRIVAL) ====================
window.notifySubscribers = function(productName, productPrice, productImage) {
    if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY_HERE') {
        alert('Please configure EmailJS first! Get your keys at emailjs.com');
        return;
    }
    
    if (!confirm(`Send new arrival email for "${productName}" to all subscribers?`)) return;
    
    db.ref("subscribers").once("value").then((snapshot) => {
        if (!snapshot.exists()) {
            alert('No subscribers yet.');
            return;
        }
        
        let sent = 0;
        let failed = 0;
        const promises = [];
        
        snapshot.forEach((child) => {
            const sub = child.val();
            if (!sub.email) return;
            
            const promise = emailjs.send(EMAILJS_SERVICE_ID, 'YOUR_NEW_ARRIVAL_TEMPLATE_ID', {
                to_email: sub.email,
                product_name: productName,
                product_price: productPrice,
                product_image: productImage,
                from_name: 'SAYAND'
            })
            .then(() => { sent++; })
            .catch(() => { failed++; });
            
            promises.push(promise);
        });
        
        return Promise.all(promises).then(() => {
            alert(`Emails sent: ${sent}\nFailed: ${failed}`);
        });
    });
};

// Init some empty rows
addSizeRow('S', 5);
addSizeRow('M', 5);
addSizeRow('L', 5);

} // emergency close