# Architecture

The extension is the only runtime path for the tixCraft pilot. The Swift application and Node backend are unchanged legacy scaffolds and are not called by the extension.

```text
tixCraft DOM mutation
  → content-script snapshot + tixcraft-v1 signature
  → deterministic decision and safety gates
  → at most one locally authorized action
  → explicit DOM/navigation postcondition
  → next state or Stop

popup ──arms/reviews──┐
service worker ───────┴── session, Stop, alerts, redacted timing events
```

## Runtime ownership

The content script owns the full latency-sensitive path. One `MutationObserver` coalesces changes with `requestAnimationFrame`; the adapter snapshots only semantic controls and known safety signals. Before dispatch, the controller repeats classification and checks that the element is connected, enabled, visible, stable, unobscured, permitted, and not already executed. The worker is informed asynchronously and is never awaited between decision and dispatch.

The service worker enforces the single-session/single-tab boundary, expiry alarm, navigation origin guard, global Stop command, notifications, and a 200-entry redacted telemetry ring. Target configuration and action history live only in `chrome.storage.session`. `chrome.storage.local` contains UI defaults, the non-sensitive draft, and redacted event/timing fields.

The popup validates target fields through the same shared core used by the controller. When the current page exposes areas, its review shows the exact resolved label, price, and rejection outcomes. In Bounded Auto, arming the configured target authorizes selection of the first unique area that satisfies the priority and maximum-price rules. If priorities are empty, it instead authorizes the first available area in page order at or below the maximum price. There is no second confirmation at the area page.

When a page exposes a Best Available control, the adapter selects or verifies it before proceeding. Some events expose the area list first; for those layouts the adapter selects the resolved area and uses the resulting route as the boundary: a ticket page continues to quantity, while `/ticket/select-seat/` or an embedded seat picker hands control to the user.

## State and action boundary

| Recognized state | Allowed automatic action | Required next condition |
| --- | --- | --- |
| Event detail | Open the unique enabled performance-list entry | Performance state appears |
| Performance selection | Select the unique row matching the configured calendar date | Performance state disappears |
| Seat mode | Select the unique `電腦配位` / Best Available control | Area or ticket state appears |
| Area selection | Match optional exact-name priorities, or select the first available row in page order when none are entered; always enforce the global maximum ticket price | Seat-mode, ticket-quantity, or manual-seat handoff appears |
| Manual seat selection | None; highlight the boundary and hand off | User chooses a seat or stops |
| Ticket selection | Set each checked 全票/優惠票 row to its requested quantity | Another requested ticket row, required acknowledgement, or manual verification handoff appears |
| Acknowledgement | Check only `#TicketForm_agree` | Manual verification or submit handoff appears |
| Reservation ready | None; highlight the submit control and hand off | User reviews and submits manually |
| Held cart | None; clear the session | User completes checkout |

CAPTCHA and verification-code fields are never read or filled. On the ticket page only, the checked 全票/優惠票 quantities and the exact `#TicketForm_agree` acknowledgement may be completed before the manual verification handoff. Matching is by partial ticket-row label. If no row contains either recognizable term, the first row is treated as 全票; this fallback is never used when a recognizable type is present. Other terms, OTP/identity checks, and seat maps lock the controller and notify the user. Final submission is manual and payment is a terminal boundary. Recognized layouts poll while an expected control or action postcondition is absent; after the matching performance appears, that wait remains bounded by the session expiry. Blocks, origin changes, adapter mismatch, ambiguity, low confidence, unknown signatures, and duplicate action IDs stop the session.

## Versioned adapter

[`extension/src/adapters/tixcraft-v1.js`](../extension/src/adapters/tixcraft-v1.js) is deliberately narrow. A supported decision needs both a known route and its matching `*-v1` structural marker; semantic labels then resolve an exact control. CSS selectors are hints inside that versioned contract, not fallbacks for an unknown page.

The JSON snapshots in [`extension/test/fixtures`](../extension/test/fixtures/) are the checked-in classification contract. Before changing selectors or promoting a new live layout:

1. Capture a sanitized semantic snapshot—never full HTML, tokens, personal data, order data, or challenge content.
2. Add positive, disabled, sold-out, ambiguous, over-budget, protected, and unknown variants.
3. Version the adapter when a structural signature changes.
4. Run the fixture and core tests, then validate Dry Run before Assist or Bounded Auto.

## Legacy projects

`ConcertMaster/` remains the macOS menu-bar skeleton and `backend/` remains its dependency-free HTTP scaffold. They are intentionally isolated from the pilot and can still be built independently.
