(async function runDomFixtures() {
  "use strict";

  const Core = globalThis.ConcertMasterCore;
  const Adapter = globalThis.TixcraftAdapterV1;
  const fixtureRoot = document.getElementById("fixture");
  const results = document.getElementById("results");
  const target = {
    eventLabel: "Aurora Taipei",
    performanceLabel: "2026/09/20 19:30",
    quantity: 2,
    seatMode: "bestAvailable",
    areaPriorities: [
      { displayLabel: "A2", namePattern: "A2" },
      { displayLabel: "A3", namePattern: "A3" }
    ],
    ticketTypePriorities: ["全票"],
    maximumUnitPriceTwd: 4800
  };
  const cases = [
    {
      name: "event-detail DOM opens the performance list",
      url: "https://tixcraft.com/activity/detail/demo",
      html: `<main data-event-detail><h1 data-event-title>Aurora Taipei</h1>
        <a href="/activity/game/demo">立即購票</a></main>`,
      expected: ["action", Core.ACTIONS.OPEN_PERFORMANCES]
    },
    {
      name: "performance DOM",
      url: "https://tixcraft.com/activity/game/demo",
      html: `<h1 data-event-title>Aurora Taipei</h1><table id="gameList"><tr data-performance>
        <td><time>2026/09/20 19:30</time></td><td><button class="btn-buy">立即購票</button></td>
      </tr></table>`,
      expected: ["action", Core.ACTIONS.SELECT_PERFORMANCE]
    },
    {
      name: "area DOM enforces price fallback",
      url: "https://tixcraft.com/ticket/area/demo",
      html: `<h1 data-event-title>Aurora Taipei</h1><ul id="zone">
        <li><a data-area-id="a2"><span class="area-name">A2</span><span class="price">NT$5,200</span></a></li>
        <li><a data-area-id="a3"><span class="area-name">A3</span><span class="price">NT$4,500</span></a></li>
      </ul>`,
      expected: ["action", Core.ACTIONS.SELECT_AREA, "area:a3"]
    },
    {
      name: "ticket DOM resolves quantity",
      url: "https://tixcraft.com/ticket/ticket/demo",
      html: `<h1 data-event-title>Aurora Taipei</h1><form id="ticketForm"><div class="ticket-unit">
        <span class="ticket-name">全票</span><select data-ticket-type="全票"><option value="0">0</option><option value="2">2</option></select>
        <button id="submitButton" type="submit">確認張數</button>
      </div></form>`,
      expected: ["action", Core.ACTIONS.SET_QUANTITY]
    },
    {
      name: "CAPTCHA DOM hands off",
      url: "https://tixcraft.com/ticket/ticket/demo",
      html: `<h1 data-event-title>Aurora Taipei</h1><form id="ticketForm"><input name="captcha_answer"></form>`,
      expected: ["handoff", undefined]
    },
    {
      name: "seat-map DOM hands off",
      url: "https://tixcraft.com/ticket/area/demo",
      html: `<h1 data-event-title>Aurora Taipei</h1><div id="zone"><canvas class="seat-map" width="100" height="100"></canvas></div>`,
      expected: ["handoff", undefined]
    }
  ];

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  for (const fixture of cases) {
    fixtureRoot.innerHTML = fixture.html;
    await nextFrame();
    const snapshot = Adapter.collectSnapshot(document, fixture.url);
    const decision = Adapter.decide(snapshot, target, { allowAreaFallback: true, bestAvailableConfirmed: true });
    const passed = decision.kind === fixture.expected[0]
      && decision.actionType === fixture.expected[1]
      && (fixture.expected[2] === undefined || decision.targetKey === fixture.expected[2]);
    const row = document.createElement("li");
    row.className = passed ? "pass" : "fail";
    row.textContent = `${passed ? "PASS" : "FAIL"} — ${fixture.name}: ${decision.kind} ${decision.actionType || ""}`;
    results.appendChild(row);
    if (!passed) document.documentElement.dataset.failed = "true";
  }
  fixtureRoot.remove();
  document.documentElement.dataset.result = document.documentElement.dataset.failed ? "failed" : "passed";
})();
