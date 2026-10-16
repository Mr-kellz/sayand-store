(() => {
    'use strict';
    const origin='https://thesayand.com';
    /* SEO_CATALOG_START */let catalog = {};
    fetch('/api/catalogue-routes').then(r=>{if(!r.ok)throw Error('Routes unavailable');return r.json();}).then(data=>{catalog=data;}).catch(()=>{});/* SEO_CATALOG_END */
    function productUrl(name) { return catalog[String(name).toLowerCase().trim()] || '/product?item=' + encodeURIComponent(name); }
    function categoryUrl(name) { return ['women','men','accessories'].includes(name) ? '/collection-' + name : '/collection'; }

    function meta(selector,attribute,value) {
        let node=document.head.querySelector(selector);
        if(node)node.setAttribute(attribute,value);
    }
    function details(title,description,image) {
        document.title='SAYAND | '+title;
        const box=document.createElement('div');box.innerHTML=String(description||'');
        const text=box.textContent.replace(/\s+/g,' ').trim().slice(0,170);
        if(text){meta('meta[name="description"]','content',text);meta('meta[property="og:description"]','content',text);}
        meta('meta[property="og:title"]','content',document.title);
        if(image && /^https:\/\//.test(image))meta('meta[property="og:image"]','content',image);
    }
    window.SayandSEO={details,productUrl,categoryUrl};
    const route=location.pathname.replace(/\.html$/,'').replace(/\/$/,'')||'/';
    const url=new URL(origin+(route==='/index'?'/':route));
    const current=new URL(location.href);
    const param=route==='/product'?'item':route==='/article'?'id':route==='/collection'?'category':null;
    if(param && current.searchParams.has(param))url.searchParams.set(param,current.searchParams.get(param));
    if (route === '/product' && current.searchParams.get('item')) url.href = origin + productUrl(current.searchParams.get('item'));
    if (route === '/collection' && current.searchParams.get('category')) url.href = origin + categoryUrl(current.searchParams.get('category'));
    meta('link[rel="canonical"]','href',url.href);meta('meta[property="og:url"]','content',url.href);
    function accessibleActions(root) {
        const nodes=[];
        if(root.matches && root.matches('div[onclick],img[onclick]'))nodes.push(root);
        if(root.querySelectorAll)nodes.push(...root.querySelectorAll('div[onclick],img[onclick]'));
        for(const node of nodes){
            if(node.hasAttribute('data-keyboard-action'))continue;
            node.setAttribute('data-keyboard-action','');
            if(!node.hasAttribute('role'))node.setAttribute('role', /location/.test(node.getAttribute('onclick'))?'link':'button');
            if(!node.hasAttribute('tabindex'))node.tabIndex=0;
            if(node.tagName==='IMG' && !node.getAttribute('alt'))node.setAttribute('aria-label',/zoom/i.test(node.getAttribute('onclick'))?'Toggle Zoom':'Open product');
            node.addEventListener('keydown',event=>{
                if(event.target!==node || !['Enter',' '].includes(event.key))return;
                event.preventDefault();node.click();
            });
        }
    }
    function start(){
        if (!window.SayandAnalytics && !document.querySelector('script[src*="shopping-analytics.js"]')) {
            const script=document.createElement('script');script.src='/js/shopping-analytics.js?v=launch-1';document.head.appendChild(script);
        }
        document.querySelectorAll('a[href]').forEach(link=>{
            try { const u=new URL(link.href);if(u.origin!==location.origin)return;
                if (/\/collection(?:\.html)?$/.test(u.pathname) && u.searchParams.has('category')) link.href=categoryUrl(u.searchParams.get('category'));
                if (/\/product(?:\.html)?$/.test(u.pathname) && u.searchParams.has('item')) link.href=productUrl(u.searchParams.get('item'));
            } catch (_) {}
        });
        const footer=document.querySelector('footer');
        if(footer && !footer.querySelector('a[href="/faq"]')){
            const link=document.createElement('a');link.href='/faq';link.textContent='FAQ';link.style.cssText='display:inline-block;margin:16px;text-decoration:underline';footer.appendChild(link);
        }

        // Placeholder text is not an accessible name; add names where the existing forms lack them.
        document.querySelectorAll('input:not([type="hidden"]),textarea,select').forEach(input=>{
            if(input.getAttribute('aria-label')||input.getAttribute('aria-labelledby')||input.closest('label'))return;
            const label=input.id&&Array.from(document.querySelectorAll('label[for]')).find(node=>node.htmlFor===input.id);
            if(label)return;
            const hint=input.getAttribute('placeholder');if(hint)input.setAttribute('aria-label',hint);
        });
        accessibleActions(document);
        new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)accessibleActions(node);}).observe(document.body,{subtree:true,childList:true});
        const main=document.querySelector('main')||document.querySelector('#heroImageContainer')?.closest('section');
        if(main){if(!main.id)main.id='main-content';main.setAttribute('tabindex','-1');const link=document.createElement('a');link.href='#'+main.id;link.className='sayand-skip-link';link.textContent='Skip to content';document.body.prepend(link);}
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
