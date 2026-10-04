(() => {
    'use strict';
    const address = document.getElementById('return-address');
    const support = document.getElementById('return-support');
    const content = document.getElementById('legal-content');
    const fallback = 'SAYAND\nVia Giuseppe di Vittorio 5\n44028 Poggio Renatico (FE)\nItaly';
    firebase.database().ref('mainStore/contact').on('value', snapshot => {
        const contact = snapshot.val() || {};
        address.textContent = typeof contact.returnAddress === 'string' && contact.returnAddress.trim() ? contact.returnAddress : fallback;
        const email = typeof contact.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) ? contact.email.trim() : 'support@thesayand.com';
        support.textContent = email;
        support.href = 'mailto:' + email;
    }, () => {
        address.textContent = SayandI18n.t('Return address unavailable. Please contact support before sending your parcel.');
    });
    firebase.database().ref('mainStore/footer/returns').on('value', snapshot => {
        const page = snapshot.val();
        if (page && typeof page.content === 'string' && page.content.trim()) {
            SayandI18n.bind(content, page.content, SayandI18n.fieldTranslations(page, 'content'), true);
        } else {
            content.textContent = SayandI18n.t('Please contact support for returns information.');
        }
    }, () => { content.textContent = SayandI18n.t('Please contact support for returns information.'); });
})();
