# Concert Master

Concert Master is a local, safety-bounded Chrome extension pilot for the ordinary tixCraft purchase flow. It observes one visible tab and can move through a fixture-backed flow from performance selection to a held cart. It never reloads the site, makes background tixCraft requests, handles verification, or enters payment data.

The existing macOS app and Node service remain in this repository as legacy scaffolds. Neither is in the extension runtime path.

## Run the extension

1. Open `chrome://extensions` in Google Chrome on macOS.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the [`extension`](extension/) directory.
4. Open the event's `https://tixcraft.com/activity/detail/<event-id>` page and open Concert Master.
5. Enter the event, exact performance, ordered areas, ticket types, quantity, and price cap.
6. Review the current page, choose Dry Run or Assist first, and arm the session.

Bounded Auto is scoped to the current tab and expires after at most 30 minutes. If real area choices are not visible when the session is first armed, it pauses at the area page so the resolved label and price can be confirmed before selection. Reservation submission is a separate, off-by-default permission.

Use **Command + Shift + .** to stop immediately. Chrome allows this shortcut to be changed at `chrome://extensions/shortcuts`.

## Safety boundary

- One session, one visible tab, one event, one action at a time.
- Exact event and performance matching; anchored area patterns with unique-match enforcement.
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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`extension/README.md`](extension/README.md) for implementation details and the fixture promotion process.
