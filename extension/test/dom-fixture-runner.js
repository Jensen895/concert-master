(async function runDomFixtures() {
  "use strict";

  const Core = globalThis.ConcertMasterCore;
  const Adapter = globalThis.TixcraftAdapterV1;
  const fixtureRoot = document.getElementById("fixture");
  const results = document.getElementById("results");
  const target = {
    showDate: "2026-09-20",
    eventId: "demo",
    seatMode: "bestAvailable",
    areaPriorities: [
      { name: "A2" },
      { name: "A3" }
    ],
    ticketRequests: [{ kind: "full", quantity: 2 }],
    maximumUnitPriceTwd: 4800
  };
  const cases = [
    {
      name: "event-detail DOM opens the performance list",
      url: "https://tixcraft.com/activity/detail/demo",
      html: `<main data-event-detail><h1>Aurora Taipei</h1>
        <a href="/activity/game/demo">立即購票</a></main>`,
      expected: ["action", Core.ACTIONS.OPEN_PERFORMANCES]
    },
    {
      name: "English event-detail DOM recognizes Buy Tickets",
      url: "https://tixcraft.com/activity/detail/demo",
      html: `<main data-event-detail><h1>Maroon 5 Taipei</h1>
        <a class="btn-buy" href="/activity/game/demo">BUY TICKETS</a></main>`,
      expected: ["action", Core.ACTIONS.OPEN_PERFORMANCES]
    },
    {
      name: "expanded event-detail DOM selects the matching Find tickets button",
      url: "https://tixcraft.com/activity/detail/demo",
      html: `<main data-event-detail><button data-action="buy">立即購票</button>
        <div id="gameList"><table><tbody>
          <tr><td>2026/09/19 (六) 19:30</td><td><button>Find tickets</button></td></tr>
          <tr><td>2026/09/20 (日) 19:30</td><td><button>Find tickets</button></td></tr>
        </tbody></table></div></main>`,
      expected: ["action", Core.ACTIONS.SELECT_PERFORMANCE, "performance:1"]
    },
    {
      name: "performance DOM",
      url: "https://tixcraft.com/activity/game/demo",
      html: `<div id="gameList"><table><tbody>
        <tr><td>2026/09/19 (六) 19:30</td><td><input class="btn-next" data-href="/ticket/area/demo/1" type="button" value="立即訂購"></td></tr>
        <tr><td>2026/09/20 (日) 19:30</td><td><input class="btn-next" data-href="/ticket/area/demo/2" type="button" value="立即訂購"></td></tr>
      </tbody></table></div>`,
      expected: ["action", Core.ACTIONS.SELECT_PERFORMANCE]
    },
    {
      name: "area DOM enforces price fallback",
      url: "https://tixcraft.com/ticket/area/demo",
      html: `<ul id="zone">
        <li><a data-area-id="a2"><span class="area-name">A2</span><span class="price">NT$5,200</span></a></li>
        <li><a data-area-id="a3"><span class="area-name">A3</span><span class="price">NT$4,500</span></a></li>
      </ul>`,
      expected: ["action", Core.ACTIONS.SELECT_AREA, "area:a3"]
    },
    {
      name: "area-first DOM does not require an earlier seat-mode control",
      url: "https://tixcraft.com/ticket/area/demo",
      html: `<ul id="zone">
        <li><a data-area-id="a2"><span class="area-name">A2</span><span class="price">NT$5,200</span></a></li>
        <li><a data-area-id="a3"><span class="area-name">A3</span><span class="price">NT$4,500</span></a></li>
      </ul>`,
      context: { allowAreaFallback: true, bestAvailableConfirmed: false },
      expected: ["action", Core.ACTIONS.SELECT_AREA, "area:a3"]
    },
    {
      name: "production area DOM resolves its nested list, exact name, and group price",
      url: "https://tixcraft.com/ticket/area/demo",
      html: `<input type="radio" id="select_form_auto" name="select_form" value="auto" checked>
        <label for="select_form_auto">Best Available</label>
        <div class="zone area-list">
          <div class="zone-label" data-id="group_0"><b>5,200區</b></div>
          <ul id="group_0" class="area-list"><li class="select_form_b"><a id="live_a2">A2 5200 <font>Available</font></a></li></ul>
          <div class="zone-label" data-id="group_1"><b>4,500區</b></div>
          <ul id="group_1" class="area-list"><li class="select_form_b"><a id="live_a3">A3 4500 <font>12 seat(s) remaining</font></a></li></ul>
        </div>`,
      expected: ["action", Core.ACTIONS.SELECT_AREA, "area:live_a3"]
    },
    {
      name: "ticket DOM partially matches full-ticket text",
      url: "https://tixcraft.com/ticket/ticket/demo",
      html: `<form id="ticketForm"><div class="ticket-unit">
        <span class="ticket-name">搖滾區全票（預售）</span><select data-ticket-type="搖滾區全票（預售）"><option value="0">0</option><option value="2">2</option></select>
        <button id="submitButton" type="submit">確認張數</button>
      </div></form>`,
      expected: ["action", Core.ACTIONS.SET_QUANTITY]
    },
    {
      name: "generic ticket DOM defaults its first row to full ticket",
      url: "https://tixcraft.com/ticket/ticket/demo",
      html: `<form id="ticketForm"><table class="ticket-list"><tbody>
        <tr><td class="ticket-name">票種 A</td><td><select name="TicketForm[ticketPrice][a]"><option value="0">0</option><option value="2">2</option></select></td></tr>
        <tr><td class="ticket-name">票種 B</td><td><select name="TicketForm[ticketPrice][b]"><option value="0">0</option><option value="2">2</option></select></td></tr>
      </tbody></table></form>`,
      expected: ["action", Core.ACTIONS.SET_QUANTITY, "ticket:0"]
    },
    {
      name: "ticket DOM advances from full ticket to discount ticket",
      url: "https://tixcraft.com/ticket/ticket/demo",
      target: {
        ...target,
        ticketRequests: [{ kind: "full", quantity: 2 }, { kind: "discount", quantity: 1 }]
      },
      html: `<form id="ticketForm"><table class="ticket-list"><tbody>
        <tr><td class="ticket-name">搖滾區全票</td><td><select id="full" name="TicketForm[ticketPrice][full]"><option value="2" selected>2</option></select></td></tr>
        <tr><td class="ticket-name">學生優惠票</td><td><select id="discount" name="TicketForm[ticketPrice][discount]"><option value="0" selected>0</option><option value="1">1</option></select></td></tr>
      </tbody></table></form>`,
      expected: ["action", Core.ACTIONS.SET_QUANTITY, "ticket:discount"]
    },
    {
      name: "ticket DOM acknowledges only the exact TixCraft checkbox",
      url: "https://tixcraft.com/ticket/ticket/demo",
      html: `<form id="ticketForm"><div class="ticket-unit">
        <span class="ticket-name">全票</span><select data-ticket-type="全票"><option value="2" selected>2</option></select>
        <label for="TicketForm_agree">I hereby acknowledge</label><input id="TicketForm_agree" type="checkbox">
        <input id="TicketForm_verifyCode" value=""><img id="TicketForm_verifyCode-image" src="/ticket/captcha">
        <button id="submitButton" type="submit">確認張數</button>
      </div></form>`,
      expected: ["action", Core.ACTIONS.ACKNOWLEDGE_TERMS]
    },
    {
      name: "CAPTCHA DOM hands off",
      url: "https://tixcraft.com/ticket/ticket/demo",
      html: `<form id="ticketForm"><div class="ticket-unit">
        <span class="ticket-name">全票</span><select data-ticket-type="全票"><option value="2" selected>2</option></select>
        <label for="TicketForm_agree">I hereby acknowledge</label><input id="TicketForm_agree" type="checkbox" checked>
        <input id="TicketForm_verifyCode" value=""><img id="TicketForm_verifyCode-image" src="/ticket/captcha">
        <button id="submitButton" type="submit">確認張數</button>
      </div></form>`,
      expected: ["handoff", undefined]
    },
    {
      name: "seat-map DOM hands off",
      url: "https://tixcraft.com/ticket/area/demo",
      html: `<div id="zone"><canvas class="seat-map" width="100" height="100"></canvas></div>`,
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
    const decision = Adapter.decide(snapshot, fixture.target || target, fixture.context || { allowAreaFallback: true, bestAvailableConfirmed: true });
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
