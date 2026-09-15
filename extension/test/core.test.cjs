const assert = require("node:assert/strict");
const test = require("node:test");
const Core = require("../src/shared/core.js");

function target(overrides = {}) {
  return {
    showDate: "2026-09-20",
    eventId: "demo",
    seatMode: "bestAvailable",
    areaPriorities: [
      { name: "A2" },
      { name: "A3" },
      { name: "B1" }
    ],
    ticketRequests: [{ kind: "full", quantity: 2 }],
    maximumUnitPriceTwd: 4800,
    ...overrides
  };
}

test("label normalization keeps meaningful area identifiers", () => {
  assert.equal(Core.normalizeLabel("  Ａ2\n區  "), "A2 區");
  assert.equal(Core.normalizedKey(" VIP-A2 "), "vip-a2");
});

test("show dates normalize without applying a timezone conversion", () => {
  assert.equal(Core.calendarDateKey("2026/9/20 (日) 19:30"), "2026-09-20");
  assert.equal(Core.calendarDateKey("2026年09月20日 19:30"), "2026-09-20");
  assert.equal(Core.calendarDateKey("2026-02-29"), "");
});

test("tixCraft page identity follows the event id through the purchase flow", () => {
  assert.deepEqual(Core.tixcraftPageIdentity("https://tixcraft.com/activity/detail/26_DEMO"), { routeKind: "detail", eventId: "26_DEMO" });
  assert.deepEqual(Core.tixcraftPageIdentity("https://tixcraft.com/activity/game/26_DEMO"), { routeKind: "performance", eventId: "26_DEMO" });
  assert.deepEqual(Core.tixcraftPageIdentity("https://tixcraft.com/ticket/area/26_DEMO/123"), { routeKind: "area", eventId: "26_DEMO" });
  assert.deepEqual(Core.tixcraftPageIdentity("https://tixcraft.com/ticket/select-seat/26_DEMO/123"), { routeKind: "seatSelection", eventId: "26_DEMO" });
});

test("only the fixed local demo server is accepted outside tixCraft", () => {
  assert.equal(Core.allowedOrigin("http://localhost:4173/activity/detail/CM_DEMO_2026/"), true);
  assert.equal(Core.allowedOrigin("http://localhost:8000/activity/detail/CM_DEMO_2026/"), false);
  assert.equal(Core.allowedOrigin("http://127.0.0.1:4173/activity/detail/CM_DEMO_2026/"), false);
});

test("prices parse without storing surrounding page content", () => {
  assert.equal(Core.parseTwd("票價 NT$ 4,800"), 4800);
  assert.equal(Core.parseTwd("price unavailable"), null);
});

test("area names use normalized exact matching", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "Ａ2", priceTwd: 4800, visible: true, enabled: true }
  ], target({ areaPriorities: [{ name: "A2" }] }));
  assert.equal(result.status, "resolved");

  const wildcard = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 4800, visible: true, enabled: true }
  ], target({ areaPriorities: [{ name: "A?" }] }));
  assert.equal(wildcard.status, "unavailable");
});

test("target validation enforces the pilot boundary", () => {
  assert.equal(Core.sanitizeTarget(target()).ok, true);
  const popupDraft = target({ eventId: undefined, eventLabel: "No longer required" });
  const sanitizedDraft = Core.sanitizeTarget(popupDraft);
  assert.equal(sanitizedDraft.ok, true);
  assert.equal("eventLabel" in sanitizedDraft.value, false);
  assert.equal(Core.sanitizeTarget(target({ showDate: "2026-02-29" })).ok, false);
  assert.equal(Core.sanitizeTarget(target({ seatMode: "pickYourOwn" })).ok, false);
  assert.equal(Core.sanitizeTarget(target({ ticketRequests: [{ kind: "full", quantity: 0 }] })).ok, false);
  assert.equal(Core.sanitizeTarget(target({ ticketRequests: [] })).ok, false);
  const noPriorities = Core.sanitizeTarget(target({ areaPriorities: [] }));
  assert.equal(noPriorities.ok, true);
  assert.deepEqual(noPriorities.value.areaPriorities, []);
  const blankPriorities = Core.sanitizeTarget(target({ areaPriorities: [{ name: "" }, { name: " A3 " }] }));
  assert.equal(blankPriorities.ok, true);
  assert.deepEqual(blankPriorities.value.areaPriorities, [{ name: "A3" }]);
  assert.equal(Core.sanitizeTarget(target({ maximumUnitPriceTwd: undefined })).ok, false);
});

test("stored three-field area drafts migrate to one exact area name", () => {
  const result = Core.sanitizeTarget(target({
    areaPriorities: [{ displayLabel: "Old label", namePattern: "B1看台103區", maximumUnitPriceTwd: 1000 }]
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.areaPriorities, [{ name: "B1看台103區" }]);
});

test("stored ticket-priority drafts migrate to one full-ticket request", () => {
  const legacyTarget = target({ quantity: 3, ticketTypePriorities: ["全票"] });
  delete legacyTarget.ticketRequests;
  const result = Core.sanitizeTarget(legacyTarget);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.ticketRequests, [{ kind: "full", quantity: 3 }]);
});

test("ticket types use partial labels and support both requested quantities", () => {
  const result = Core.resolveTicketPlan([
    { key: "full", label: "搖滾區全票 NT$4,800", visible: true, enabled: true },
    { key: "discount", label: "學生優惠票 NT$2,400", visible: true, enabled: true }
  ], [
    { kind: "full", quantity: 2 },
    { kind: "discount", quantity: 1 }
  ]);
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.assignments.map((assignment) => assignment.ticket.key), ["full", "discount"]);
});

test("the first ticket row defaults to full ticket only when labels are indistinguishable", () => {
  const generic = Core.resolveTicketPlan([
    { key: "first", label: "票種 A", visible: true, enabled: true },
    { key: "second", label: "票種 B", visible: true, enabled: true }
  ], [{ kind: "full", quantity: 2 }]);
  assert.equal(generic.status, "resolved");
  assert.equal(generic.assignments[0].ticket.key, "first");

  const recognizable = Core.resolveTicketPlan([
    { key: "discount", label: "限量優惠票", visible: true, enabled: true }
  ], [{ kind: "full", quantity: 2 }]);
  assert.equal(recognizable.status, "unavailable");
});

test("area resolution follows priority and the global maximum ticket price", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true },
    { key: "b1", label: "B1", priceTwd: 3800, visible: true, enabled: true }
  ], target());
  assert.equal(result.status, "resolved");
  assert.equal(result.area.key, "a3");
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["overBudget", "eligible"]);
});

test("an empty priority list selects the first eligible area within the price limit", () => {
  const result = Core.resolveAreaPlan([
    { key: "premium", label: "Premium", priceTwd: 5200, visible: true, enabled: true },
    { key: "first-match", label: "A2", priceTwd: 4700, visible: true, enabled: true },
    { key: "cheaper", label: "A3", priceTwd: 3800, visible: true, enabled: true }
  ], target({ areaPriorities: [] }));
  assert.equal(result.status, "resolved");
  assert.equal(result.area.key, "first-match");
  assert.equal(result.selectionMode, "firstEligible");
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["overBudget", "eligible"]);
});

test("automatic area selection skips unavailable and previously attempted rows", () => {
  const result = Core.resolveAreaPlan([
    { key: "sold-out", label: "A1", priceTwd: 4800, visible: true, enabled: false, soldOut: true },
    { key: "attempted", label: "A2", priceTwd: 4700, visible: true, enabled: true },
    { key: "next", label: "A3", priceTwd: 4600, visible: true, enabled: true }
  ], target({ areaPriorities: [] }), ["attempted"]);
  assert.equal(result.area.key, "next");
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["unavailable", "alreadyAttempted", "eligible"]);
});

test("fallback-disabled resolution never broadens the first choice", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 4700, visible: true, enabled: false },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ], target(), [], false);
  assert.equal(result.status, "unavailable");
  assert.equal(result.outcomes.length, 1);
});

test("an over-budget first choice always advances to the next priority", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ], target(), [], false);
  assert.equal(result.status, "resolved");
  assert.equal(result.area.key, "a3");
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["overBudget", "eligible"]);
});

test("duplicate matching labels are ambiguous even when one is unavailable", () => {
  const result = Core.resolveAreaPlan([
    { key: "left", label: "A2", priceTwd: 4800, visible: true, enabled: true },
    { key: "right", label: "A2", priceTwd: 4800, visible: true, enabled: false }
  ], target());
  assert.equal(result.status, "ambiguous");
});

test("attempted inventory is never selected again", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 4700, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ], target(), ["a2"], true);
  assert.equal(result.area.key, "a3");
});

test("an area with no visible price never becomes eligible", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: null, visible: true, enabled: true }
  ], target({ maximumUnitPriceTwd: undefined }));
  assert.equal(result.status, "unavailable");
  assert.equal(result.outcomes[0].status, "priceUnknown");
});

test("telemetry drops labels, URLs, and arbitrary content", () => {
  assert.deepEqual(Core.redactEvent({
    type: "decision", state: "areaSelection", eventLabel: "secret", url: "https://example.test", html: "<body>", confidence: 1
  }), { type: "decision", state: "areaSelection", confidence: 1 });
});
