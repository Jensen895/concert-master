# tixCraft performance-selection research

Research performed 2026-09-11 against public open-source projects. The useful implementations agree on this browser flow:

1. Start at `/activity/detail/<event-id>`. The purchase control may navigate to `/activity/game/<event-id>` or reveal the performance list inline on the detail page.
2. Read performance rows from `#gameList > table > tbody > tr` in either location.
3. Read the show date from the row (normally its first cell), then activate the purchase control inside that same row.
4. That control has appeared as a plain “Find tickets” link/button, `.btn-next`, `button[data-href]`, and historically `input[data-href]`.

English event detail pages may label their entry CTA `BUY TICKETS` rather than `Buy now` or a Chinese purchase label. The adapter treats that normalized label as the same purchase-entry action while retaining unique-control enforcement.

Sources:

- [bouob/tickets_hunter](https://github.com/bouob/tickets_hunter), commit `e7b3ab56f205622158511ddd6e160fc274b2c9dd` (2026-08-23): current row collection, localized sale-state filtering, date-keyword matching, and row-scoped `data-href` handling.
- [Gilg4mesh/tixcraft_bot](https://github.com/Gilg4mesh/tixcraft_bot), commit `a20e0f626d739d82f23b60b75f0c9f95dbdbcf45` (2019-10-02): detail-to-game event-ID flow, `#gameList` rows, `.btn-next`, and date keyword matching.
- [claaaaassic/tixcraft-ticket](https://github.com/claaaaassic/tixcraft-ticket), commit `add74bc23c80572c59d6c6249a7df1704d382ed7` (2016-11-25): configured ticket date matched against the first cell of each performance row, with the row's purchase URL selected.
- [zlargon/tixcraft Hacking](https://gist.github.com/zlargon/63cbcf4b3024c9343be012f1d91bac39), commit `fedc973db7a8ab5d9e226ee2be51b096b2172a57` (2016-06-25): captured TixCraft markup showing the first-column date and `input[data-href]` purchase control.

Visual fixture references added 2026-09-11:

- [djpken/tixcraft-helper `25_david.html`](https://github.com/djpken/tixcraft-helper/blob/f761e640a0b409d8894504846e289361d7962223/25_david.html), commit `f761e640a0b409d8894504846e289361d7962223` (2025-09-21): a full saved production page showing the dark utility bar, blue gradient navigation, tixCraft/Ticketmaster Taiwan lockup, breadcrumb, blurred event-art backdrop, centered poster/title, filters, and the performance table rendered inline on `/activity/detail/`.
- [kuzco77/tixcraft-camper seat-selection screenshot](https://github.com/kuzco77/tixcraft-camper/blob/d8d426e45943acd2514e953c46bf128341793b35/.screenshot/seats.png), commit `d8d426e45943acd2514e953c46bf128341793b35` (2025-12-02): a rendered current-flow reference for the five-step progress indicator, compact event summary, Best Available/Pick Your Own switch, two-column seat map, price-group headers, availability text, and sold-out styling.

The same tixcraft-camper revision includes sanitized production-shaped area markup in `element/full.html`: the unique outer container is `.zone.area-list`, while every price group is another `ul.area-list`. Available Best Available sections are `li.select_form_b > a`; their visible text concatenates an area name, the group price, and availability (for example `B1看台103區5980 Available`). Adapter v1 therefore identifies the outer container first, takes the price from its matching `.zone-label`, strips the trailing price/availability from the link text, and performs exact matching on the remaining area name.

The local demo reproduces those structural and visual patterns with fictional event artwork and data. It does not copy live event assets or personal/session data from the captured files.

Concert Master intentionally narrows the common keyword approach: it normalizes the user's date to `YYYY-MM-DD`, extracts a calendar date from each row without timezone conversion, and acts only when exactly one row matches. Two showtimes on the same day are treated as ambiguous and stop safely. The extension also keeps its existing prohibition on reloads, background TixCraft requests, CAPTCHA handling, and payment automation.
