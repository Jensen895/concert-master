# tixCraft extension pilot

This directory is a load-unpacked Manifest V3 extension. It ships as plain JavaScript and CSS so the reviewed source is exactly what Chrome executes.

Start a session on the event's `/activity/detail/<event-id>` page. The adapter verifies the event title there and opens the unique enabled performance-list control before matching the configured performance.

## Layout

- `manifest.json` grants only the two tixCraft HTTPS origins plus storage, notifications, alarms, active-tab access, and tab lifecycle access for origin-change Stop.
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

## Area patterns

Adapter v1 uses a small anchored glob language, not regular expressions. `A2` matches only `A2`; `A?` can match `A2`; `A*` can match `A2 Left`. Every preference must resolve to exactly one visible area before availability and price checks. Multiple matches are always ambiguous.

The effective cap is the lower of the overall cap and the preference-specific cap. With fallback disabled, any failure of the first preference pauses. With fallback enabled, explicit inventory failure can advance once through reviewed preferences, never in parallel and never beyond three attempted areas.

## Deliberate limitations

The adapter stops when it cannot verify the event label or a supported structural signature. This is intentional: a site redesign must become a reviewed fixture and a new adapter version, not an increasingly broad selector. The pilot never reads or logs full page HTML and contains no network client for tixCraft.

Use Dry Run against sanitized fixtures before relying on a selector update. The included tests require Node.js 20+ and use only its built-in test runner.

On macOS without Node.js, the core fixture smoke suite can also run with the built-in JavaScript runtime:

```sh
osascript -l JavaScript test/jxa-smoke.js \
  "$PWD/src/shared/core.js" \
  "$PWD/src/adapters/tixcraft-v1.js" \
  "$PWD/test/fixtures/classification.json"
```

Open `test/dom-fixture-runner.html` in a browser to exercise the real DOM collectors against sanitized performance, area, ticket, CAPTCHA, and seat-map markup. Every row should report `PASS`.
