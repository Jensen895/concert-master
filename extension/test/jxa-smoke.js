ObjC.import("Foundation");

function read(path) {
  return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(argv) {
  if (argv.length !== 3) throw new Error("Expected core, adapter, and fixture paths.");
  eval(read(argv[0]));
  eval(read(argv[1]));
  const fixtures = JSON.parse(read(argv[2]));
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

  assert(ConcertMasterCore.sanitizeTarget(target).ok, "valid target rejected");
  assert(ConcertMasterCore.normalizeLabel(" Ａ2\n區 ") === "A2 區", "normalization failed");
  assert(ConcertMasterCore.calendarDateKey("2026/9/20 (日) 19:30") === "2026-09-20", "show date normalization failed");
  assert(ConcertMasterCore.calendarDateKey("2026-02-29") === "", "invalid show date accepted");
  assert(ConcertMasterCore.parseTwd("NT$ 4,800") === 4800, "price parsing failed");
  const areaPlan = ConcertMasterCore.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ], target, [], true);
  assert(areaPlan.status === "resolved" && areaPlan.area.key === "a3", "priority or price enforcement failed");
  const noPrice = ConcertMasterCore.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: null, visible: true, enabled: true }
  ], Object.assign({}, target, { maximumUnitPriceTwd: undefined }), [], true);
  assert(noPrice.status === "unavailable", "unknown price was treated as eligible");

  fixtures.forEach(function checkFixture(fixture) {
    const snapshot = Object.assign({
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
      submits: []
    }, fixture.snapshot);
    const decision = TixcraftAdapterV1.decide(snapshot, target, {
      allowAreaFallback: true,
      bestAvailableConfirmed: true
    });
    Object.keys(fixture.expected).forEach(function checkExpected(key) {
      assert(decision[key] === fixture.expected[key], fixture.name + ": expected " + key);
    });
    assert(decision.confidence >= 0.98, fixture.name + ": confidence below threshold");
  });
  return "passed " + fixtures.length + " adapter fixtures and core smoke checks";
}
