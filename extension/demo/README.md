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
- 全票: checked, quantity `2`
- 優惠票: unchecked (or check it and choose a separate quantity to test both rows)
- Maximum ticket price: `4800`
- Area priority 1: `A1搖滾站區` (sold out)
- Area priority 2: `黃2B區` (available at NT$4,800)
- Allow lower priorities: on

The full fixture path is event detail → four performance dates → six differently priced sections (including sold-out and restricted sections) → ticket quantity → held cart.

On the detail page, `立即訂購` reveals the four-date performance panel in place. Each date ends with a `Find tickets` action, matching the current tixCraft interaction while keeping the fixture itself script-free.

For an end-to-end Bounded Auto run, the extension selects the resolved `黃2B區 · NT$4,800` section without asking for another confirmation, sets each checked ticket quantity, and checks the acknowledgement. It then pauses for you to enter the demo verification code `cm42` and press **確認張數** manually. The final page is only a local held-cart fixture.
