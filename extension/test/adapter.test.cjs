const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Core = require("../src/shared/core.js");
const Adapter = require("../src/adapters/tixcraft-v1.js");

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/classification.json"), "utf8"));
const target = {
  showDate: "2026-09-20",
  eventId: "demo",
  seatMode: "bestAvailable",
  areaPriorities: [
    { name: "A2" },
    { name: "A3" },
    { name: "B1" }
  ],
  ticketRequests: [{ kind: "full", quantity: 2 }],
  maximumUnitPriceTwd: 4800
};

function completeSnapshot(snapshot) {
  return {
    adapterVersion: Core.ADAPTER_VERSION,
    routeKind: "unknown",
    layoutSignature: null,
    ready: true,
    busy: false,
    eventId: "demo",
    signals: {},
    entries: [],
    performances: [],
    seatModes: [],
    areas: [],
    tickets: [],
    acknowledgements: [],
    submits: [],
    ...snapshot,
    signals: { ...(snapshot.signals || {}) }
  };
}

for (const fixture of fixtures) {
  test(`fixture: ${fixture.name}`, () => {
    const decision = Adapter.decide(completeSnapshot(fixture.snapshot), target, {
      allowAreaFallback: true,
      bestAvailableConfirmed: true
    });
    for (const [key, value] of Object.entries(fixture.expected)) assert.equal(decision[key], value, key);
    assert.ok(decision.confidence >= 0.98);
    if (["stop", "handoff", "cart", "wait"].includes(fixture.expected.kind)) {
      assert.equal(decision.actionType, undefined, "protected/non-actionable fixtures must not propose actions");
    }
  });
}

test("postconditions require an explicit next state", () => {
  const pending = { actionType: Core.ACTIONS.SET_QUANTITY, targetKey: "ticket:full" };
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.TICKET }), false);
  assert.equal(Adapter.postconditionMet(pending, {
    state: Core.STATES.TICKET,
    actionType: Core.ACTIONS.SET_QUANTITY,
    targetKey: "ticket:full"
  }), false);
  assert.equal(Adapter.postconditionMet(pending, {
    state: Core.STATES.TICKET,
    actionType: Core.ACTIONS.SET_QUANTITY,
    targetKey: "ticket:discount"
  }), true);
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.RESERVATION_READY }), true);
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.ACKNOWLEDGEMENT }), true);
});

test("acknowledgement completion accepts the manual verification handoff", () => {
  const pending = { actionType: Core.ACTIONS.ACKNOWLEDGE_TERMS };
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.HANDOFF }), true);
});

test("area selection may advance to a seat-mode choice before quantity", () => {
  const pending = { actionType: Core.ACTIONS.SELECT_AREA };
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.SEAT_MODE }), true);
});

test("event entry requires an explicit performance-list postcondition", () => {
  const pending = { actionType: Core.ACTIONS.OPEN_PERFORMANCES };
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.EVENT_DETAIL }), false);
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.PERFORMANCE }), true);
});

test("event identity is inherited from the starting detail-page URL", () => {
  const snapshot = completeSnapshot({
    routeKind: "detail",
    layoutSignature: "detail-v1",
    eventId: "demo",
    entries: [{ key: "event:1", label: "立即購票", visible: true, enabled: true }]
  });
  assert.equal(Adapter.decide(snapshot, target).actionType, Core.ACTIONS.OPEN_PERFORMANCES);
});

test("English Buy Tickets is a supported purchase-entry label", () => {
  assert.equal(Adapter.isActionLabel("BUY TICKETS"), true);
});

test("show date selects the correct row when an event has multiple dates", () => {
  const snapshot = completeSnapshot({
    routeKind: "performance",
    layoutSignature: "performance-v1",
    performances: [
      { key: "performance:first", label: "2026/09/19 19:30", showDate: "2026-09-19", visible: true, enabled: true },
      { key: "performance:target", label: "2026/09/20 19:30", showDate: "2026-09-20", visible: true, enabled: true }
    ]
  });
  assert.equal(Adapter.decide(snapshot, target).targetKey, "performance:target");
});

test("two performances on the same selected date fail closed", () => {
  const snapshot = completeSnapshot({
    routeKind: "performance",
    layoutSignature: "performance-v1",
    performances: [
      { key: "performance:matinee", label: "2026/09/20 14:00", showDate: "2026-09-20", visible: true, enabled: true },
      { key: "performance:evening", label: "2026/09/20 19:30", showDate: "2026-09-20", visible: true, enabled: true }
    ]
  });
  assert.equal(Adapter.decide(snapshot, target).kind, "stop");
});

test("area-only layouts select the area before the site reveals the seat flow", () => {
  const snapshot = completeSnapshot(fixtures[6].snapshot);
  const decision = Adapter.decide(snapshot, target, { allowAreaFallback: true, bestAvailableConfirmed: false });
  assert.equal(decision.kind, "action");
  assert.equal(decision.actionType, Core.ACTIONS.SELECT_AREA);
  assert.equal(decision.targetKey, "area:a3");
});

test("area-only layouts use the first in-budget row when priorities are omitted", () => {
  const snapshot = completeSnapshot({
    routeKind: "area",
    layoutSignature: "area-v1",
    areas: [
      { key: "area:premium", label: "Premium", priceTwd: 5200, visible: true, enabled: true },
      { key: "area:first-match", label: "A2", priceTwd: 4700, visible: true, enabled: true },
      { key: "area:cheaper", label: "A3", priceTwd: 3800, visible: true, enabled: true }
    ]
  });
  const decision = Adapter.decide(snapshot, { ...target, areaPriorities: [] }, {
    allowAreaFallback: true,
    bestAvailableConfirmed: false
  });
  assert.equal(decision.kind, "action");
  assert.equal(decision.actionType, Core.ACTIONS.SELECT_AREA);
  assert.equal(decision.targetKey, "area:first-match");
});

test("a direct quantity page can continue after area selection without an earlier seat-mode control", () => {
  const snapshot = completeSnapshot(fixtures[8].snapshot);
  const decision = Adapter.decide(snapshot, target, { bestAvailableConfirmed: false });
  assert.equal(decision.kind, "action");
  assert.equal(decision.actionType, Core.ACTIONS.SET_QUANTITY);
});

test("multiple requested ticket types are filled one row at a time", () => {
  const twoTypeTarget = {
    ...target,
    ticketRequests: [
      { kind: "full", quantity: 2 },
      { kind: "discount", quantity: 1 }
    ]
  };
  const snapshot = completeSnapshot({
    routeKind: "ticket",
    layoutSignature: "ticket-v1",
    tickets: [
      {
        key: "ticket:full",
        label: "搖滾區全票",
        visible: true,
        enabled: true,
        selectedQuantity: 2,
        options: [{ value: "2", quantity: 2, enabled: true }]
      },
      {
        key: "ticket:discount",
        label: "學生優惠票",
        visible: true,
        enabled: true,
        selectedQuantity: 0,
        options: [{ value: "1", quantity: 1, enabled: true }]
      }
    ]
  });
  const decision = Adapter.decide(snapshot, twoTypeTarget);
  assert.equal(decision.actionType, Core.ACTIONS.SET_QUANTITY);
  assert.equal(decision.targetKey, "ticket:discount");
});

test("a generic first ticket row is treated as full ticket", () => {
  const snapshot = completeSnapshot({
    routeKind: "ticket",
    layoutSignature: "ticket-v1",
    tickets: [{
      key: "ticket:first",
      label: "票種 A",
      visible: true,
      enabled: true,
      selectedQuantity: 0,
      options: [{ value: "2", quantity: 2, enabled: true }]
    }]
  });
  assert.equal(Adapter.decide(snapshot, target).targetKey, "ticket:first");
});

test("ticket setup runs before verification, then leaves verification and submit manual", () => {
  const base = {
    routeKind: "ticket",
    layoutSignature: "ticket-v1",
    eventId: "demo",
    signals: { challenge: true },
    tickets: [{
      key: "ticket:full",
      label: "全票",
      visible: true,
      enabled: true,
      selectedQuantity: 0,
      options: [{ value: "2", quantity: 2, enabled: true }]
    }],
    acknowledgements: [{
      key: "acknowledgement:TicketForm_agree",
      label: "I hereby acknowledge",
      checked: false,
      visible: true,
      enabled: true
    }],
    submits: [{ key: "submit:1", label: "確認張數", visible: true, enabled: true }]
  };

  let decision = Adapter.decide(completeSnapshot(base), target);
  assert.equal(decision.actionType, Core.ACTIONS.SET_QUANTITY);

  base.tickets[0].selectedQuantity = 2;
  decision = Adapter.decide(completeSnapshot(base), target);
  assert.equal(decision.actionType, Core.ACTIONS.ACKNOWLEDGE_TERMS);

  base.acknowledgements[0].checked = true;
  decision = Adapter.decide(completeSnapshot(base), target);
  assert.equal(decision.kind, "handoff");
  assert.equal(decision.signal, "challenge");
  assert.equal(decision.actionType, undefined);

  base.signals.challenge = false;
  decision = Adapter.decide(completeSnapshot(base), target);
  assert.equal(decision.kind, "handoff");
  assert.equal(decision.signal, "manualSubmit");
  assert.equal(decision.actionType, undefined);
  assert.equal(decision.targetKey, "submit:1");
});

test("a select-seat route hands control to the user", () => {
  const snapshot = completeSnapshot({
    routeKind: "seatSelection",
    eventId: "demo"
  });
  const decision = Adapter.decide(snapshot, target);
  assert.equal(decision.kind, "handoff");
  assert.equal(decision.signal, "seatMap");
});

test("production area text is separated into an exact name and ticket price", () => {
  assert.deepEqual(
    Adapter.parseAreaDescriptor("B1看台103區5980 26 seat(s) remaining", "5980區"),
    { label: "B1看台103區", priceTwd: 5980 }
  );
  assert.deepEqual(
    Adapter.parseAreaDescriptor("紅2A區5800 尚有票券", 5800),
    { label: "紅2A區", priceTwd: 5800 }
  );
  assert.deepEqual(
    Adapter.parseAreaDescriptor("B1看台103區 Available"),
    { label: "B1看台103區", priceTwd: null }
  );
});

test("fixture classification stays comfortably inside the decision budget", () => {
  const samples = [];
  const snapshot = completeSnapshot(fixtures[6].snapshot);
  for (let index = 0; index < 1000; index += 1) {
    const started = performance.now();
    Adapter.decide(snapshot, target, { allowAreaFallback: true, bestAvailableConfirmed: true });
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  assert.ok(samples[Math.floor(samples.length * 0.95)] < 50);
});
