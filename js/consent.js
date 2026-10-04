
/* Optional browser storage is off until a visitor makes a choice. */
(() => {
    'use strict';
    const key = 'sayand_consent_v1';
    const read = () => {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value && value.version === 1 ? value : null;
        } catch (_) { return null; }
    };
    let choice = read();
    let panel, settings, previousFocus;
    const allowed = category => !!(choice && choice[category] === true);
    function cleanOptionalStorage() {
        try {
            if (!allowed('analytics')) localStorage.removeItem('sayand_visitor_id');
            if (!allowed('personalization')) localStorage.removeItem('sayand_recently_viewed');
            localStorage.removeItem('sayand_cookies_accepted');
        } catch (_) {}
    }
    cleanOptionalStorage();
    function hide() {
        if (panel) panel.hidden = true;
        if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }
    function save(analytics, personalization) {
        choice = {version:1,analytics:!!analytics,personalization:!!personalization,updatedAt:new Date().toISOString()};
        try { localStorage.setItem(key,JSON.stringify(choice)); } catch (_) {}
        cleanOptionalStorage();
        hide();
        window.dispatchEvent(new CustomEvent('sayand:consentchange',{detail:choice}));
    }
    function open() {
        if (!panel) return;
        previousFocus=document.activeElement;
        panel.hidden=false; settings.hidden=false;
        panel.querySelector('[name="analytics"]').checked=allowed('analytics');
        panel.querySelector('[name="personalization"]').checked=allowed('personalization');
        panel.querySelector('h2').focus();
    }
    window.SayandConsent={allowed,open,save,get choice(){return choice;}};
    window.addEventListener('storage',event=>{
        if(event.key!==key) return;
        choice=read();cleanOptionalStorage();
        window.dispatchEvent(new CustomEvent('sayand:consentchange',{detail:choice}));
        if(panel) panel.hidden=!!choice;
    });
    function start() {
        document.querySelectorAll('#cookie-banner').forEach(node=>node.remove());
        panel=document.createElement('section');
        panel.className='sayand-consent';panel.setAttribute('aria-labelledby','consent-title');
        panel.hidden=!!choice;
        panel.innerHTML=`<h2 id="consent-title" tabindex="-1">Your privacy choices</h2>
<p>Essential storage keeps your account, shopping bag and preferences working. With your permission, we also store a visitor ID for statistics and remember recently viewed products. You can reject optional storage and still shop.</p>
<p><a href="cookie.html">Cookie Policy</a> · <a href="privacy.html">Privacy Policy</a></p>
<div class="sayand-consent-actions"><button type="button" data-consent="reject">Reject optional</button><button type="button" data-consent="accept">Accept optional</button><button type="button" data-consent="customize">Customize</button></div>
<div data-consent-settings hidden><label><input type="checkbox" name="analytics"> <span>Visitor statistics</span></label><label><input type="checkbox" name="personalization"> <span>Remember recently viewed products</span></label><button type="button" data-consent="save">Save choices</button></div>`;
        document.body.appendChild(panel);settings=panel.querySelector('[data-consent-settings]');
        panel.querySelector('[data-consent="reject"]').addEventListener('click',()=>save(false,false));
        panel.querySelector('[data-consent="accept"]').addEventListener('click',()=>save(true,true));
        panel.querySelector('[data-consent="customize"]').addEventListener('click',()=>{settings.hidden=!settings.hidden;});
        panel.querySelector('[data-consent="save"]').addEventListener('click',()=>save(panel.querySelector('[name="analytics"]').checked,panel.querySelector('[name="personalization"]').checked));
        const button=document.createElement('button');button.type='button';button.className='sayand-cookie-settings';button.textContent='Cookie settings';button.addEventListener('click',open);
        (document.querySelector('footer')||document.body).appendChild(button);
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
