const assert = require("node:assert/strict");
const test = require("node:test");
const Core = require("../src/shared/core.js");

function target(overrides = {}) {
  return {
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

test("area patterns are bounded, anchored globs", () => {
  assert.equal(Core.patternMatches("A?", "A2"), true);
  assert.equal(Core.patternMatches("A?", "A20"), false);
  assert.equal(Core.patternMatches("A2", "VIP A2"), false);
  assert.throws(() => Core.compileNamePattern(""));
});

test("target validation enforces the pilot boundary", () => {
  assert.equal(Core.sanitizeTarget(target()).ok, true);
  const popupDraft = target({ eventId: undefined, eventLabel: "No longer required" });
  const sanitizedDraft = Core.sanitizeTarget(popupDraft);
  assert.equal(sanitizedDraft.ok, true);
  assert.equal("eventLabel" in sanitizedDraft.value, false);
  assert.equal(Core.sanitizeTarget(target({ showDate: "2026-02-29" })).ok, false);
  assert.equal(Core.sanitizeTarget(target({ seatMode: "pickYourOwn" })).ok, false);
  assert.equal(Core.sanitizeTarget(target({ quantity: 0 })).ok, false);
  assert.equal(Core.sanitizeTarget(target({ areaPriorities: [] })).ok, false);
});

test("area resolution follows priority and the effective price cap", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true },
    { key: "b1", label: "B1", priceTwd: 3800, visible: true, enabled: true }
  ], target());
  assert.equal(result.status, "resolved");
  assert.equal(result.area.key, "a3");
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["overBudget", "eligible"]);
});

test("fallback-disabled resolution never broadens the first choice", () => {
  const result = Core.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ], target(), [], false);
  assert.equal(result.status, "unavailable");
  assert.equal(result.outcomes.length, 1);
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

test("area authorization must match adapter, key, label, and price", () => {
  const plan = { status: "resolved", area: { key: "a2", label: "A2", priceTwd: 4800 } };
  assert.equal(Core.sameResolvedAreaPlan({ adapterVersion: "tixcraft-v1", areaKey: "a2", label: "A2", priceTwd: 4800 }, plan), true);
  assert.equal(Core.sameResolvedAreaPlan({ adapterVersion: "tixcraft-v1", areaKey: "a2", label: "A2", priceTwd: 5000 }, plan), false);
});

test("telemetry drops labels, URLs, and arbitrary content", () => {
  assert.deepEqual(Core.redactEvent({
    type: "decision", state: "areaSelection", eventLabel: "secret", url: "https://example.test", html: "<body>", confidence: 1
  }), { type: "decision", state: "areaSelection", confidence: 1 });
});
