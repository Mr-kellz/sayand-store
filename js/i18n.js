/* SAYAND: deterministic English, Italian, French and German storefront text. No translation service. */
(() => {
    'use strict';
    if (window.SayandI18n) return;
    const normalize = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    const languages = ['en','it','fr','de'];
    const readLanguage = () => {
        try { const code = localStorage.getItem('sayand_lang'); return languages.includes(code) ? code : 'en'; }
        catch (_) { return 'en'; }
    };
    let language = readLanguage();
    let observer = null;
    const textRecords = new WeakMap();
    const attributeRecords = new WeakMap();
    const boundContent = new WeakMap();
    const catalog = new Map();
    const custom = Object.create(null);
    const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const skipSelector = 'script,style,textarea,input,code,pre,svg,[translate="no"],.notranslate,[data-sayand-content]';

    function t(value) {
        const text = String(value == null ? '' : value);
        if (language === 'en') return text;
        const key = normalize(text);
        const dictionary = (window.SAYAND_TRANSLATIONS || {})[language] || {};
        const translated = (custom[language] || {})[key] || dictionary[key];
        if (typeof translated === 'string') return text.replace(text.trim(), translated);
        // Variable UI labels retain their values and translate only their fixed wording.
        const rules = language === 'it' ? [
            [/^SIZE (.+)$/i, 'TAGLIA $1'], [/^Size: (.+)$/, 'Taglia: $1'],
            [/^Color: (.+)$/, 'Colore: $1'], [/^Qty: (.+)$/, 'Qtà: $1'],
            [/^ORDER #(.+)$/i, 'ORDINE #$1'], [/^Order: (.+)$/, 'Ordine: $1'],
            [/^CODE: (.+)$/, 'CODICE: $1'], [/^Only (\d+) left!?$/i, 'Solo $1 disponibili'],
            [/^SPRING \/ SUMMER (\d{4})$/, 'PRIMAVERA / ESTATE $1'],
            [/^Premium quality (.+) piece from SAYAND\.$/, 'Un capo SAYAND di qualità.'],
            [/^Error: (.+)$/, 'Errore: $1'],
            [/^Sorry, only (\d+) in stock for this size!$/, 'Solo $1 articoli disponibili in questa taglia.'],
            [/^A password reset link has been securely sent to (.+)$/, 'Abbiamo inviato un link per reimpostare la password a $1']
        ] : language === 'fr' ? [
            [/^SIZE (.+)$/i, 'TAILLE $1'], [/^Size: (.+)$/, 'Taille : $1'],
            [/^Color: (.+)$/, 'Couleur : $1'], [/^Qty: (.+)$/, 'Qté : $1'],
            [/^ORDER #(.+)$/i, 'COMMANDE #$1'], [/^Order: (.+)$/, 'Commande : $1'],
            [/^CODE: (.+)$/, 'CODE : $1'], [/^Only (\d+) left!?$/i, 'Plus que $1 disponibles'],
            [/^SPRING \/ SUMMER (\d{4})$/, 'PRINTEMPS / ÉTÉ $1'],
            [/^Premium quality (.+) piece from SAYAND\.$/, 'Une pièce SAYAND de qualité supérieure.'],
            [/^Error: (.+)$/, 'Erreur : $1'],
            [/^Sorry, only (\d+) in stock for this size!$/, 'Seulement $1 articles disponibles dans cette taille.'],
            [/^A password reset link has been securely sent to (.+)$/, 'Un lien de réinitialisation du mot de passe a été envoyé à $1']
        ] : [
            [/^SIZE (.+)$/i, 'GRÖSSE $1'], [/^Size: (.+)$/, 'Größe: $1'],
            [/^Color: (.+)$/, 'Farbe: $1'], [/^Qty: (.+)$/, 'Menge: $1'],
            [/^ORDER #(.+)$/i, 'BESTELLUNG #$1'], [/^Order: (.+)$/, 'Bestellung: $1'],
            [/^CODE: (.+)$/, 'CODE: $1'], [/^Only (\d+) left!?$/i, 'Nur noch $1 verfügbar'],
            [/^SPRING \/ SUMMER (\d{4})$/, 'FRÜHLING / SOMMER $1'],
            [/^Premium quality (.+) piece from SAYAND\.$/, 'Ein hochwertiges Kleidungsstück von SAYAND.'],
            [/^Error: (.+)$/, 'Fehler: $1'],
            [/^Sorry, only (\d+) in stock for this size!$/, 'Nur noch $1 Artikel in dieser Größe verfügbar.'],
            [/^A password reset link has been securely sent to (.+)$/, 'Ein Link zum Zurücksetzen des Passworts wurde an $1 gesendet']
        ];
        for (const [pattern, replacement] of rules) {
            if (pattern.test(key)) return text.replace(text.trim(), key.replace(pattern, replacement));
        }
        // Unreviewed text stays in its original language.
        return text;
    }

    function translate(value, code = language, html = false) {
        const previous = language;
        language = languages.includes(code) ? code : 'en';
        try {
            if (language === 'en') return String(value || '');
            if (!html) return t(value);
            const wrapper = document.createElement('div');
            wrapper.innerHTML = String(value || '');
            const phrase = normalize(wrapper.textContent).replace(/\s/g, '').toUpperCase();
            if (phrase === 'ESSENTIALMODERNITY') return {en:'ESSENTIAL<br>MODERNITY',it:'MODERNITÀ<br>ESSENZIALE',fr:'MODERNITÉ<br>ESSENTIELLE',de:'ESSENZIELLE<br>MODERNE'}[language];
            walk(wrapper);
            return wrapper.innerHTML;
        } finally { language = previous; }
    }

    const translateItalian = (value, html = false) => translate(value, 'it', html);
    function fieldTranslations(item, field) {
        return Object.fromEntries(languages.filter(code=>code!=='en').map(code=>[code, item.translations && item.translations[code] && item.translations[code][field] || '']));
    }

    function processText(node) {
        if (!node.parentElement || node.parentElement.closest(skipSelector)) return;
        const current = node.data;
        let state = textRecords.get(node);
        if (!state || current !== state.rendered) state = {source: current, rendered: current};
        const next = t(state.source);
        state.rendered = next;
        textRecords.set(node, state);
        if (node.data !== next) {
            const option = node.parentElement.closest('option');
            if (option && !option.hasAttribute('value')) option.setAttribute('value', normalize(option.textContent));
            node.data = next;
        }
    }

    function processAttributes(element) {
        if (element.closest(skipSelector)) return;
        const records = attributeRecords.get(element) || {};
        for (const attribute of ['placeholder', 'aria-label', 'title']) {
            if (!element.hasAttribute(attribute)) continue;
            const current = element.getAttribute(attribute);
            let state = records[attribute];
            if (!state || current !== state.rendered) state = {source: current, rendered: current};
            state.rendered = t(state.source);
            records[attribute] = state;
            if (current !== state.rendered) element.setAttribute(attribute, state.rendered);
        }
        attributeRecords.set(element, records);
    }

    function renderBound(element) {
        const data = boundContent.get(element);
        if (!data) return;
        const output = data.translations[language] || translate(data.en, language, data.html);
        const property = data.html ? 'innerHTML' : 'textContent';
        if (element[property] !== output) element[property] = output;
    }

    function bind(element, en, it, html = false) {
        if (!element) return;
        element.setAttribute('data-sayand-content', '');
        boundContent.set(element, {en: String(en || ''), translations: typeof it === 'object' && it ? it : {it:String(it || '')}, html});
        renderBound(element);
    }

    function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) { processText(root); return; }
        if (root.nodeType !== 1 && root.nodeType !== 9) return;
        if (root.nodeType === 1) {
            if (root.hasAttribute('data-product-name')) renderProductNode(root);
            if (root.hasAttribute('data-sayand-en')) {
                const original = root.getAttribute('data-sayand-en');
                const localized = root.getAttribute('data-sayand-' + language);
                const output = localized || translate(original, language);
                if (root.textContent !== output) root.textContent = output;
                return;
            }
            if (root.hasAttribute('data-sayand-content')) { renderBound(root); return; }
            if (root.matches('script,style,textarea,input,code,pre,svg,[translate="no"],.notranslate')) {
                // Input placeholders can be localized without touching their values.
                if (['INPUT','TEXTAREA'].includes(root.tagName) && !root.matches('[translate="no"],.notranslate')) {
                    const inputRecords = attributeRecords.get(root) || {};
                    for (const attribute of ['placeholder','aria-label','title']) {
                        const current = root.getAttribute(attribute);
                        if (current === null) continue;
                        let state = inputRecords[attribute];
                        if (!state || current !== state.rendered) state = {source:current,rendered:current};
                        state.rendered=t(state.source); inputRecords[attribute]=state;
                        if (current!==state.rendered) root.setAttribute(attribute,state.rendered);
                    }
                    attributeRecords.set(root,inputRecords);
                }
                return;
            }
            processAttributes(root);
        }
        for (const child of Array.from(root.childNodes)) walk(child);
    }

    function refresh() {
        document.documentElement.lang = language;
        walk(document.documentElement);
        document.querySelectorAll('[data-language-selector]').forEach(el => { el.value = language; });
        document.querySelectorAll('#lang-toggle').forEach(el => { el.textContent = language.toUpperCase(); });
        window.dispatchEvent(new CustomEvent('sayand:languagechange', {detail:{language}}));
    }

    function setLanguage(code) {
        if (!languages.includes(code)) return;
        language = code;
        try { localStorage.setItem('sayand_lang', code); } catch (_) {}
        refresh();
    }

    function productValue(product, field, fallback = '') {
        const item = catalog.get(product.name) || product;
        const parts = field.split('.');
        const valueAt = source => parts.reduce((v,k) => v && v[k], source);
        const en = valueAt(item) || fallback;
        const localized = valueAt(item.translations && item.translations[language]) || (field !== 'name' ? translate(en, language) : '');
        return {en:String(en || ''),localized:String(localized || '')};
    }

    function contentHTML(en, it) {
        const translations = typeof it === 'object' && it ? it : {it};
        const output = translations[language] || translate(en, language);
        const attributes = languages.filter(code=>code!=='en').map(code=>`data-sayand-${code}="${escape(translations[code])}"`).join(' ');
        return `<span data-sayand-en="${escape(en)}" ${attributes} translate="no">${escape(output)}</span>`;
    }

    function productHTML(product, field = 'name', fallback = '') {
        if (product.name && !catalog.has(product.name)) catalog.set(product.name, product);
        const values = productValue(product,field,fallback);
        const output = language !== 'en' && values.localized ? values.localized : values.en;
        return `<span data-product-name="${escape(product.name)}" data-product-field="${escape(field)}" data-product-fallback="${escape(values.en)}" translate="no">${escape(output)}</span>`;
    }

    function renderProductNode(element) {
        const name = element.getAttribute('data-product-name');
        const values = productValue({name},element.getAttribute('data-product-field') || 'name',element.getAttribute('data-product-fallback') || name);
        const output = language !== 'en' && values.localized ? values.localized : values.en;
        if (element.textContent !== output) element.textContent = output;
    }

    function bindProduct(element, product, field, fallback = '') {
        if (!element) return;
        catalog.set(product.name, product);
        element.removeAttribute('data-sayand-content');
        boundContent.delete(element);
        element.setAttribute('data-product-name',product.name);
        element.setAttribute('data-product-field',field);
        element.setAttribute('data-product-fallback',String(fallback || product[field] || ''));
        element.setAttribute('translate','no');
        renderProductNode(element);
    }

    function registerCatalog(data) {
        if (!data) return;
        for (const section of ['newArrivals','trending','sales','upcomingSales']) {
            for (const item of Object.values(data[section] || {})) {
                if (item && item.name) catalog.set(item.name,item);
            }
        }
        for (const code of languages.filter(code=>code!=='en')) {
            custom[code] = Object.create(null);
            for (const [en,value] of Object.entries(data.translations && data.translations[code] || {})) {
                if (typeof value === 'string') custom[code][normalize(en)] = value;
            }
        }
        if (document.body) walk(document.body);
    }

    // Remove stale cookies left by the old translator. No third-party script is loaded.
    for (const domain of ['', location.hostname, '.' + location.hostname, '.' + location.hostname.split('.').slice(-2).join('.')]) {
        document.cookie = 'googtrans=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
    }
    window.SayandI18n = {t, translate, translateItalian, fieldTranslations, bind, bindProduct, productHTML, contentHTML, registerCatalog, setLanguage, refresh, get language(){return language;}};
    window.changeSiteLanguage = setLanguage;
    // Translate application dialogs without changing their result or control flow.
    for (const method of ['alert','confirm']) {
        const original = window[method].bind(window);
        window[method] = message => original(t(message));
    }
    window.addEventListener('pageshow', () => { language=readLanguage(); refresh(); });
    window.addEventListener('storage', event => { if(event.key==='sayand_lang'){language=readLanguage();refresh();} });
    const start = () => {
        // A compact footer control makes the choice available on every storefront page.
        const control = document.createElement('div');
        control.className='sayand-language-control';
        control.innerHTML='<label><span>Language</span> <select data-language-selector aria-label="Language"><option value="en">English</option><option value="it">Italiano</option><option value="fr">Français</option><option value="de">Deutsch</option></select></label>';
        control.querySelector('select').addEventListener('change',event=>setLanguage(event.target.value));
        (document.querySelector('footer') || document.body).appendChild(control);
        for (const id of ['heroTitle','editTitle']) {
            const element = document.getElementById(id);
            if (element && !element.hasAttribute('data-sayand-content')) {
                bind(element, element.innerHTML, {}, true);
            }
        }
        refresh();
        observer=new MutationObserver(records=>{
            const roots=new Set();
            for(const record of records){
                if(record.type==='childList') for(const node of record.addedNodes) roots.add(node);
                else roots.add(record.target);
            }
            for(const root of roots) if(root.isConnected) walk(root);
        });
        observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
})();
