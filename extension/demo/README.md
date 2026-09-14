# Local tixCraft demo

This is a static, fake purchase flow for testing the unpacked Concert Master extension. It does not call tixCraft or create an order.

From `extension/`, start the server:

```sh
python3 -m http.server 4173 --directory demo
```

`npm run demo` is an equivalent shortcut when npm is available.

Then open:

```text
http://localhost:4173/activity/detail/CM_DEMO_2026/
```

Reload the unpacked extension after changing `manifest.json`. The extension deliberately accepts this exact local origin; another port or `127.0.0.1` will not pass its runtime origin check.

Suggested configuration:

- Show date: `2026-12-19`
- Quantity: `2`
- Maximum / ticket: `4800`
- Area priority 1: label and pattern `A1搖滾站區` (sold out)
- Area priority 2: label and pattern `黃2B區` (available at NT$4,800)
- Allow lower priorities: on
- Ticket types: `全票`

The full fixture path is event detail → four performance dates → six differently priced sections (including sold-out and restricted sections) → ticket quantity → held cart.

On the detail page, `立即訂購` reveals the four-date performance panel in place. Each date ends with a `Find tickets` action, matching the current tixCraft interaction while keeping the fixture itself script-free.

For an end-to-end Bounded Auto run, enable **Allow one reservation submit**. The extension intentionally pauses on the section page; open its popup, review the resolved `黃2B區 · NT$4,800` choice, check the confirmation box, and choose **Authorize & resume**. The final page is only a local held-cart fixture.
