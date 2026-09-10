# tixCraft performance-selection research

Research performed 2026-09-11 against public open-source projects. The useful implementations agree on this browser flow:

1. Start at `/activity/detail/<event-id>`. The purchase control may navigate to `/activity/game/<event-id>` or reveal the performance list inline on the detail page.
2. Read performance rows from `#gameList > table > tbody > tr` in either location.
3. Read the show date from the row (normally its first cell), then activate the purchase control inside that same row.
4. That control has appeared as a plain “Find tickets” link/button, `.btn-next`, `button[data-href]`, and historically `input[data-href]`.

Sources:

- [bouob/tickets_hunter](https://github.com/bouob/tickets_hunter), commit `e7b3ab56f205622158511ddd6e160fc274b2c9dd` (2026-08-23): current row collection, localized sale-state filtering, date-keyword matching, and row-scoped `data-href` handling.
- [Gilg4mesh/tixcraft_bot](https://github.com/Gilg4mesh/tixcraft_bot), commit `a20e0f626d739d82f23b60b75f0c9f95dbdbcf45` (2019-10-02): detail-to-game event-ID flow, `#gameList` rows, `.btn-next`, and date keyword matching.
- [claaaaassic/tixcraft-ticket](https://github.com/claaaaassic/tixcraft-ticket), commit `add74bc23c80572c59d6c6249a7df1704d382ed7` (2016-11-25): configured ticket date matched against the first cell of each performance row, with the row's purchase URL selected.
- [zlargon/tixcraft Hacking](https://gist.github.com/zlargon/63cbcf4b3024c9343be012f1d91bac39), commit `fedc973db7a8ab5d9e226ee2be51b096b2172a57` (2016-06-25): captured TixCraft markup showing the first-column date and `input[data-href]` purchase control.

Concert Master intentionally narrows the common keyword approach: it normalizes the user's date to `YYYY-MM-DD`, extracts a calendar date from each row without timezone conversion, and acts only when exactly one row matches. Two showtimes on the same day are treated as ambiguous and stop safely. The extension also keeps its existing prohibition on reloads, background TixCraft requests, CAPTCHA handling, and payment automation.
