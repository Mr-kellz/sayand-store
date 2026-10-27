# ELIA and preorder order workflow — 24 October 2026

## Behaviour
- ELIA's active semantic engine reads validated preorder products and explains full upfront payment, preorder/launch prices, savings and estimated dispatch. Product cards distinguish preorders from in-stock products.
- Paid orders containing any preorder appear in Admin → Preorder Orders until shipped. Mixed orders stay together; this release does not support partial shipment.
- Customer orders label preorder items PREORDERED and show estimated dispatch. Shipping updates the existing order record, customer status and admin grouping without copying/deleting order data.
- Admin shipping requires a tracking code and calls an administrator-only server function. Both the status dropdown and Mark Shipped & Email button use it. Failed validation leaves the displayed status unchanged.
- A database update trigger sends the existing shipping email template. A persisted claim suppresses duplicate emails on repeated events. Failed/uncertain email delivery is flagged for admin review instead of blindly retried.

## Verification
- Consolidated suite: 58 test files passed, 0 failures, 2 emulator-only suites skipped. Release configuration/template gate passed. git diff --check passed.
- Tests cover configured/invalid/hidden/sold-out preorders, provider context, stale product facts, product cards; real admin rendering and folder transitions; mixed orders and canceled orders; administrator authorization, required tracking, preserved items, duplicate events and email failure handling.
- Browser preview used synthetic data and actual admin order rendering. Confirmed count 1 → 0 on shipment and order appearance under normal orders with PREORDER · SHIPPED. Screenshot: preorder-order-folder-preview.png.
- Live AI provider tests using public catalogue data passed preorder discovery, full payment versus deposit, savings, dispatch versus delivery and Italian payment explanation. Temporary provider rate limits required spacing calls.
- Live catalogue at test time: CROCHET TOP preorder €52.99, launch €66.99, savings €14, estimated dispatch 2 December 2026. Product data was not edited.
- No real customer order was changed; no test shipping email or payment was sent. Actual email delivery was not exercised with a real customer.

## Release
Deployment and post-deployment verification recorded below after completion.

Deployed successfully to sayand-store: eliaChat, cataloguePages, shipStoreOrder, notifyOrderShipped and Hosting. Live HTTPS checks passed for admin folder markup, dashboard labels, shipping button/callable wiring, shared order workflow, ELIA cards and rendered CROCHET TOP script version.
