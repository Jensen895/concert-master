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

The popup is the authorization surface. It validates target fields through the same shared core used by the controller. When the current page exposes areas, it shows the exact resolved label, price, and rejection outcomes. An authorization is bound to the adapter version, element key, price, label, and page generation. A later DOM/navigation generation cannot reuse it.

Best Available is also carried as explicit session evidence. It is set only when the selected control is observed or the corresponding action reaches its postcondition; area and ticket actions hand off when that evidence is absent.

## State and action boundary

| Recognized state | Allowed automatic action | Required next condition |
| --- | --- | --- |
| Event detail | Open the unique enabled performance-list entry | Performance state appears |
| Performance selection | Select the unique row matching the configured calendar date | Performance state disappears |
| Seat mode | Select the unique `電腦配位` / Best Available control | Area or ticket state appears |
| Area selection | Select the first unique, available, reviewed, in-budget preference | Ticket state appears |
| Ticket selection | Set the approved ticket type to the exact quantity | Reservation-ready state appears |
| Reservation ready | Submit once, only with separate permission | Held cart or explicit protected state |
| Held cart | None; clear the session | User completes checkout |

Challenges, OTP/identity checks, terms, and seat maps lock the controller and notify the user. Payment is a terminal boundary. Blocks, origin changes, adapter mismatch, ambiguity, low confidence, unknown signatures, duplicate action IDs, and postcondition timeout stop the session.

## Versioned adapter

[`extension/src/adapters/tixcraft-v1.js`](../extension/src/adapters/tixcraft-v1.js) is deliberately narrow. A supported decision needs both a known route and its matching `*-v1` structural marker; semantic labels then resolve an exact control. CSS selectors are hints inside that versioned contract, not fallbacks for an unknown page.

The JSON snapshots in [`extension/test/fixtures`](../extension/test/fixtures/) are the checked-in classification contract. Before changing selectors or promoting a new live layout:

1. Capture a sanitized semantic snapshot—never full HTML, tokens, personal data, order data, or challenge content.
2. Add positive, disabled, sold-out, ambiguous, over-budget, protected, and unknown variants.
3. Version the adapter when a structural signature changes.
4. Run the fixture and core tests, then validate Dry Run before Assist or Bounded Auto.

## Legacy projects

`ConcertMaster/` remains the macOS menu-bar skeleton and `backend/` remains its dependency-free HTTP scaffold. They are intentionally isolated from the pilot and can still be built independently.
