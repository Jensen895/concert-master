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
  quantity: 2,
  seatMode: "bestAvailable",
  areaPriorities: [
    { displayLabel: "A2", namePattern: "A2" },
    { displayLabel: "A3", namePattern: "A3" },
    { displayLabel: "B1", namePattern: "B1" }
  ],
  ticketTypePriorities: ["全票"],
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
  const pending = { actionType: Core.ACTIONS.SET_QUANTITY };
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.TICKET }), false);
  assert.equal(Adapter.postconditionMet(pending, { state: Core.STATES.RESERVATION_READY }), true);
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

test("area selection requires prior Best Available evidence", () => {
  const snapshot = completeSnapshot(fixtures[6].snapshot);
  const decision = Adapter.decide(snapshot, target, { allowAreaFallback: true, bestAvailableConfirmed: false });
  assert.equal(decision.kind, "handoff");
  assert.equal(decision.signal, "seatModeUnverified");
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
