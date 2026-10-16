/* Essential order confirmation; analytics is separately gated by consent. */
(() => {
  'use strict';
  const title = document.getElementById('confirmation-title');
  const message = document.getElementById('confirmation-message');
  function show(heading, text) { title.textContent = heading; message.textContent = text; }
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem('sayand_pending_checkout')); } catch (_) {}
  if (!pending || !/^[-A-Za-z0-9_]{20}$/.test(pending.id || '') || Date.now() - pending.at > 86400000) {
    show('Check your order', 'Open My Account to see your latest order and payment status.');
    return;
  }
  let ref, listener, timer, confirmed;
  const stop = () => { if (ref && listener) ref.off('value', listener); clearTimeout(timer); };
  firebase.auth().onAuthStateChanged(user => {
    stop(); confirmed = null;
    if (!user || user.uid !== pending.uid) {
      show('Check your order', 'Sign in to the account used at checkout to view your order.');
      return;
    }
    ref = firebase.database().ref('orders/' + pending.id);
    timer = setTimeout(() => {
      stop(); show('Confirmation pending', 'We are still waiting for payment confirmation. Check My Account for the latest status before trying another payment.');
    }, 60000);
    listener = snapshot => {
      const order = snapshot.val();
      if (!order || order.userId !== user.uid) return;
      if (order.status === 'Payment Review') {
        stop(); show('Payment under review', 'Your payment needs a store review. Please check My Account or contact support.'); return;
      }
      if (!order.paymentDate || !order.stripeSessionId || !['Paid', 'Preparing', 'Preparing Shipment', 'Shipped', 'Delivered', 'Completed'].includes(order.status)) return;
      stop(); confirmed = {order, uid: user.uid};
      show('Order confirmed', 'Thank you. Payment for order #' + pending.id.slice(-6).toUpperCase() + ' is confirmed. You can follow its progress in My Account.');
      window.SayandAnalytics?.purchase(pending.id, order, user.uid);
      // Remove only purchased cart rows that still match the checkout snapshot.
      // Items added or changed in another tab after checkout must stay in the bag.
      for (const [key, old] of Object.entries(pending.cart || {})) {
        if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
        const cartRef = firebase.database().ref('users/' + user.uid + '/cart/' + key);
        let hold;
        // Keep the row loaded while transacting; an uncached null must not
        // prematurely abort cleanup in Firebase's client transaction API.
        new Promise((resolve, reject) => {
          hold = cartRef.on('value', resolve, reject);
        }).then(() => cartRef.transaction(current => {
          if (current && current.name === old.name && current.size === old.size && current.color === old.color &&
              Number(current.quantity) === Number(old.quantity) && current.addedAt === old.addedAt) return null;
          return;
        })).catch(() => {}).finally(() => { if (hold) cartRef.off('value', hold); });
      }
    };
    ref.on('value', listener, () => { stop(); show('Check your order', 'We could not load confirmation here. Check My Account for your order status.'); });
  });
  window.addEventListener('sayand:consentchange', () => {
    if (confirmed) window.SayandAnalytics?.purchase(pending.id, confirmed.order, confirmed.uid);
  });
  window.addEventListener('pagehide', stop, {once: true});
})();
