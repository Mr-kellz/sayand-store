# Separate preorder sections

Collections now split regular products and preorder drops. When a collection contains drops, regular products appear under CURRENT COLLECTION and future releases under PREORDER DROPS with a gold divider and contrasting background. The grouping applies to standalone collection pages, category routes, and collection folders. Empty preorder sections are omitted.

Preorder cards show a PREORDER badge, launch/preorder prices, saving, estimated dispatch date and upfront-payment notice. Existing product settings and media were not changed.

Validation: 55 test files passed, no failures, two emulator-only skips. New regression coverage checks men/women/accessories category boundaries, mixed/regular-only/preorder-only/empty collections, no duplicate placement, and server-rendered price/date/badge. Browser preview of the live catalogue confirmed the visual division in Men with CROCHET TOP only in the preorder section.
