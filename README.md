# Concert Master

Concert Master is a local, safety-bounded Chrome extension pilot for the ordinary tixCraft purchase flow. It observes one visible tab and can move through a fixture-backed flow from performance selection to a held cart. It never reloads the site, makes background tixCraft requests, handles verification, or enters payment data.

The existing macOS app and Node service remain in this repository as legacy scaffolds. Neither is in the extension runtime path.

## Run the extension

1. Open `chrome://extensions` in Google Chrome on macOS.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the [`extension`](extension/) directory.
4. Open the event's `https://tixcraft.com/activity/detail/<event-id>` page and open Concert Master.
5. Enter the show date, ordered areas, ticket types, quantity, and price cap. The event identity comes from the open detail-page URL.
6. Review the current page, choose Dry Run or Assist first, and arm the session.

## Run the local tixCraft demo

The repository includes a static, fake purchase flow so the extension can be tested without a live event:

```sh
cd extension
python3 -m http.server 4173 --directory demo
```

Reload the unpacked extension, then open `http://localhost:4173/activity/detail/CM_DEMO_2026/`. The demo has four performance dates, multiple ticket prices, available and sold-out sections, quantity selection, and a held-cart result. Suggested extension inputs are documented in [`extension/demo/README.md`](extension/demo/README.md).

Bounded Auto is scoped to the current tab and expires after at most 30 minutes. If real area choices are not visible when the session is first armed, it pauses at the area page so the resolved label and price can be confirmed before selection. Reservation submission is a separate, off-by-default permission.

Use **Command + Shift + .** to stop immediately. Chrome allows this shortcut to be changed at `chrome://extensions/shortcuts`.

## Safety boundary

- One session, one visible tab, one event captured from its detail-page URL, one action at a time.
- Exact calendar-date matching with unique-match enforcement; anchored area patterns with unique-match enforcement.
- Best Available only. Graphical seat maps always hand off.
- No reloads, polling requests, private endpoints, CAPTCHA processing, identity/OTP automation, terms acceptance, or payment inspection.
- Every dispatch has a unique action ID and must reach an explicit postcondition within eight seconds.
- Unknown layouts, adapter mismatch, blocks, ambiguous controls, stale targets, and origin changes fail closed.
- Session state lives in `chrome.storage.session`. Local telemetry is bounded and redacted.

## Validate

The extension has no build step or third-party runtime dependencies. With Node.js 20 or newer:

```sh
cd extension
npm test
npm run check
```

Tests exercise normalized matching, price limits, priority/fallback behavior, protected states, duplicate ambiguity, postconditions, and the versioned classification fixtures in [`extension/test/fixtures/classification.json`](extension/test/fixtures/classification.json).

The legacy components retain their original commands:

```sh
swift build
cd backend && npm test
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/TIXCRAFT_FLOW_RESEARCH.md`](docs/TIXCRAFT_FLOW_RESEARCH.md), and [`extension/README.md`](extension/README.md) for implementation details, source research, and the fixture promotion process.
