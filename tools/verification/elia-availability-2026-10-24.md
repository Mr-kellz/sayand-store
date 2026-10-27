# ELIA availability improvements

- Ordinary questions can return a complete answer and verified product IDs in the planning response, avoiding a second provider request. Server calculation tools remain available and force a second answer phase when used. Existing provider responses without a direct answer retain the compatible two-step path.
- Provider rate-limit retry allowance increased from 8 to 25 seconds within the existing total deadline, reserving ten seconds for the retry. Unknown network/timeout outcomes are not blindly retried.
- Confirmed provider rate-limit failures now leave a retryable receipt with a retry time, rather than a permanently uncertain receipt. Retry checks the receipt, respects the waiting period and resends the original question with the same ID when allowed. Atomic locking prevents duplicate sends; owner/text/expiry checks remain enforced.
- Existing anti-abuse and daily spending limits remain in place. Provider account capacity has not been upgraded; external rate limits can still occur.
- 59 test files passed, zero failures; two emulator-only suites skipped. New coverage includes one-call cards, a 15-second provider wait, retry cooldown, owner/message binding, concurrent retries, successful replay and the real chat Retry handler. Existing arithmetic, privacy, catalogue and stale-data checks pass.
- Live preorder query completed in one provider call and returned CROCHET TOP's accurate price, dispatch date and verified card.
- Live calculation query retained two provider phases and correctly returned €57.99 for €52.99 + €5.

Deployed eliaChat, cataloguePages and Hosting successfully. Live homepage and product script versions plus safe Retry handler verified.
