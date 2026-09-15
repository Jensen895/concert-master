# tixCraft extension pilot

This directory is a load-unpacked Manifest V3 extension. It ships as plain JavaScript and CSS so the reviewed source is exactly what Chrome executes.

Start a session on the event's `/activity/detail/<event-id>` page. The adapter captures the event ID from that URL, opens the unique enabled performance list, and selects the unique “Find tickets” row whose calendar date matches the configured show date. The performance list may appear inline or on `/activity/game/<event-id>`.

## Layout

- `manifest.json` grants the two tixCraft HTTPS origins and the local demo host, plus storage, notifications, alarms, active-tab access, and tab lifecycle access for origin-change Stop. Runtime validation limits the demo host to exactly `http://localhost:4173`.
- `src/shared/core.js` contains target validation, label/price normalization, deterministic preference resolution, action IDs, and telemetry redaction.
- `src/adapters/tixcraft-v1.js` maps versioned page signatures to semantic snapshots and decisions.
- `src/content/content.js` owns observation, safety checks, dispatch, postconditions, overlays, and teardown.
- `src/background/service-worker.js` owns the single session, expiry, Stop, notifications, and redacted event storage.
- `src/popup/` is the explicit review and arming surface.
- `test/fixtures/` is the adapter classification contract.

## Modes

- **Off:** no observer or action remains.
- **Dry Run:** displays the exact proposed action.
- **Assist:** highlights and focuses it for the user.
- **Bounded Auto:** dispatches only individually allowlisted action types after all gates pass.

There is no transition that silently upgrades a running session. Changing mode requires stopping and arming a new one.

On a recognized ticket page, Bounded Auto may set the configured 全票 and/or 優惠票 quantities and click only the exact `#TicketForm_agree` acknowledgement. Ticket labels are partial-matched on those terms; if neither term appears anywhere, only the first row may stand in for 全票. It never reads or fills `#TicketForm_verifyCode` and never submits the form. After those preparatory actions it pauses so verification and final submission remain manual.

## Area priorities

Each priority contains one exact event-specific area name, such as `B1看台103區`. The adapter separates the area name from the price and availability text in current tixCraft rows, normalizes the name, and requires it to resolve to exactly one visible area.

The required maximum ticket price is the single budget baseline for every area. An over-budget priority is always discarded and resolution continues with the next name. With fallback disabled, non-price failures of the first preference pause. With fallback enabled, explicit inventory failure can advance once through reviewed preferences, never in parallel and never beyond three attempted areas.

Some events, including layouts shaped like `/ticket/area/<event>/<performance>`, present the area before any seat-choice step. In Bounded Auto, Concert Master selects the highest-priority eligible area without asking for another confirmation. A resulting quantity page continues normally; a `/ticket/select-seat/` route or embedded seat picker pauses for manual seat choice.

## Deliberate limitations

The adapter stops when it cannot verify the event ID from the purchase-flow URL, uniquely resolve the selected show date, or recognize a supported structural signature. This is intentional: a site redesign must become a reviewed fixture and a new adapter version, not an increasingly broad selector. The pilot never reads or logs full page HTML and contains no network client for tixCraft.

Use Dry Run against sanitized fixtures before relying on a selector update. The included tests require Node.js 20+ and use only its built-in test runner.

On macOS without Node.js, the core fixture smoke suite can also run with the built-in JavaScript runtime:

```sh
osascript -l JavaScript test/jxa-smoke.js \
  "$PWD/src/shared/core.js" \
  "$PWD/src/adapters/tixcraft-v1.js" \
  "$PWD/test/fixtures/classification.json"
```

Open `test/dom-fixture-runner.html` in a browser to exercise the real DOM collectors against sanitized performance, area, ticket, CAPTCHA, and seat-map markup. Every row should report `PASS`.

## Local interactive demo

The static pages in `demo/` reproduce the recognized purchase flow and include four performance dates, six price sections, sold-out states, ticket quantities, and a held-cart destination. They never contact tixCraft.

```sh
cd extension
python3 -m http.server 4173 --directory demo
```

Reload the unpacked extension after pulling the localhost manifest permission, then open `http://localhost:4173/activity/detail/CM_DEMO_2026/`. See [`demo/README.md`](demo/README.md) for a target configuration that exercises sold-out fallback.
