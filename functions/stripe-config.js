'use strict';
function config(env = process.env) {
    const mode = env.STRIPE_MODE || 'test';
    if (!['test', 'live'].includes(mode)) throw new Error('STRIPE_MODE must be test or live.');
    const key = env.STRIPE_SECRET_KEY || '';
    if (!key.startsWith('sk_' + mode + '_')) throw new Error('Stripe key does not match STRIPE_MODE.');
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
    if (!webhookSecret.startsWith('whsec_')) throw new Error('Stripe webhook signing secret is required.');
    return {mode, key, webhookSecret, live: mode === 'live'};
}
function assertSession(session, settings) {
    if (!session || session.livemode !== settings.live) throw new Error('Stripe session mode mismatch.');
}
module.exports = {config, assertSession};
