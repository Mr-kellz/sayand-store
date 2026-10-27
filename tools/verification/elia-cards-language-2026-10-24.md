# ELIA preorder cards and greeting language

- Added explicit current-message language guidance: HI/HELLO receive English replies even after Italian history; Italian questions still receive Italian replies.
- Prompt requires catalogue product IDs when discussing available preorder products. If the model omits a card while naming a full, unambiguous preorder name, the server adds the matching verified public product card. Unknown IDs still fail validation and partial name matches do not attach cards.
- Restored chat history now retains validated product cards across page navigation. The displayed card belongs to its historical answer; new questions and checkout revalidate current data.
- Updated script versions on storefront pages and synchronized dynamic templates.
- Regression suite: 58 test files passed, zero failures, two emulator-only suites skipped. Includes missing product ID, exact versus partial name, image/link/price/date rendering, restored cards and language guidance in both AI phases.
- Live provider checks passed: HI → “Hi! How can I help you today?” and HELLO → “Hello! How can I help you today?”, seeded with Italian conversation history. Preorder discovery returned CROCHET TOP with its verified image and product URL.
- Browser check with the actual renderer and public catalogue confirmed the image loads, details and View product link render, and the complete card survives page reload. Screenshot: elia-preorder-card-restored.png.

Deployed eliaChat, cataloguePages and Hosting successfully. Live homepage/product script versions and card-restoration script verified.
