# Paid preorder release — 23 October 2026

- Fixed all 68 supplied VS Code Tailwind layout-conflict diagnostics, retaining hidden popup/grid behavior with shared layout classes.
- New products and preorder drops receive dynamic product routes and sitemap entries; no per-product source HTML generation is necessary.
- Public preorder API exposes only catalogue fields and omits hidden, draft and VIP drops. No database access rules were weakened.
- Admin can create and edit launch price, preorder price, remaining shared capacity, estimated dispatch date, description, sizes and images. Supports comma/dot decimals; rejects invalid prices, stale edits and failed saves.
- Store collections, search, product details and drops list include public preorders. Existing drops remain unavailable for payment until the merchant supplies valid price, capacity and dispatch date.
- Checkout refreshes prices/disclosures. Server calculates the preorder price, enforces stock and dates, and snapshots the paid price and dispatch estimate. Full payment uses the existing Stripe payment flow. Orders/admin/email identify preorders.
- Paid stock deduction and webhook retries were tested locally. Already-paid prices survive a later product launch.

## Validation

54 test files passed, zero failures, two local-emulator-only files skipped. New preorder tests cover server price tampering, invalid/date-expired configurations, capacity, variant quantities, stale disclosures, webhook retry idempotence, post-launch paid-price preservation, dynamic pages, public-field filtering, admin decimals/editing/rollback/stale inventory.
Browser fixture verified €70 launch / €60 preorder / €10 saved, size selection, enabled preorder bag button, collection listing and upcoming drops listing. The fixture was local only; no test product or order was added to production and no actual payment was taken.
The supplied 68 diagnostics were rechecked: zero remaining hidden/flex/grid class conflicts.

## Google returns follow-up

Merchant Center return policy 9410574948 saved for Italy, 30 days, free return shipping, emailed printable prepaid label. Screenshot: sayand-returns-saved.png. Earlier missing-shipping product diagnostic cleared after the €5 Italy feed update.

## Production verification

Deployment completed successfully for cataloguePages, createStripeCheckout, stripeWebhook and Firebase Hosting. Live product /product-crochet-top returns HTTP 200 and is included in sitemap. Live /sales renders CROCHET TOP with its images and €65.99 launch price. Browser console reported no product-page errors. Live admin includes preorder price and dispatch controls. Existing CROCHET TOP has no preorder price, quantity or dispatch date: payment correctly stays disabled pending merchant input; no values were invented. See preorder-live.png.
