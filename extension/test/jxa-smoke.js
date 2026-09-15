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
    seatMode: "bestAvailable",
    areaPriorities: [
      { name: "A2" },
      { name: "A3" },
      { name: "B1" }
    ],
    ticketRequests: [{ kind: "full", quantity: 2 }],
    maximumUnitPriceTwd: 4800
  };

  assert(ConcertMasterCore.sanitizeTarget(target).ok, "valid target rejected");
  const noPriorityTarget = ConcertMasterCore.sanitizeTarget(Object.assign({}, target, { areaPriorities: [{ name: "" }] }));
  assert(noPriorityTarget.ok && noPriorityTarget.value.areaPriorities.length === 0, "blank optional area priority rejected");
  assert(!ConcertMasterCore.sanitizeTarget(Object.assign({}, target, { maximumUnitPriceTwd: undefined })).ok, "missing maximum ticket price accepted");
  const migratedTarget = ConcertMasterCore.sanitizeTarget(Object.assign({}, target, {
    areaPriorities: [{ displayLabel: "Old label", namePattern: "B1看台103區", maximumUnitPriceTwd: 1000 }]
  }));
  assert(migratedTarget.ok && migratedTarget.value.areaPriorities[0].name === "B1看台103區", "legacy area draft migration failed");
  assert(ConcertMasterCore.normalizeLabel(" Ａ2\n區 ") === "A2 區", "normalization failed");
  assert(ConcertMasterCore.calendarDateKey("2026/9/20 (日) 19:30") === "2026-09-20", "show date normalization failed");
  assert(ConcertMasterCore.calendarDateKey("2026-02-29") === "", "invalid show date accepted");
  assert(!ConcertMasterCore.targetPerformanceAppeared({
    performances: [{ showDate: "2026-09-20", visible: false }]
  }, target), "hidden Find tickets control started the session timer");
  assert(ConcertMasterCore.targetPerformanceAppeared({
    performances: [{ showDate: "2026-09-20", visible: true }]
  }, target), "visible Find tickets control did not start the session timer");
  assert(ConcertMasterCore.parseTwd("NT$ 4,800") === 4800, "price parsing failed");
  const partialTicketPlan = ConcertMasterCore.resolveTicketPlan([
    { key: "full", label: "搖滾區全票 NT$4,800", visible: true, enabled: true },
    { key: "discount", label: "學生優惠票 NT$2,500", visible: true, enabled: true }
  ], [
    { kind: "full", quantity: 2 },
    { kind: "discount", quantity: 1 }
  ]);
  assert(partialTicketPlan.status === "resolved", "partial ticket-type matching failed");
  assert(partialTicketPlan.assignments[0].ticket.key === "full", "full ticket matched the wrong row");
  assert(partialTicketPlan.assignments[1].ticket.key === "discount", "discount ticket matched the wrong row");
  const genericTicketPlan = ConcertMasterCore.resolveTicketPlan([
    { key: "first", label: "票種 A", visible: true, enabled: true },
    { key: "second", label: "票種 B", visible: true, enabled: true }
  ], [{ kind: "full", quantity: 2 }]);
  assert(genericTicketPlan.status === "resolved" && genericTicketPlan.assignments[0].ticket.key === "first", "generic first-row full-ticket fallback failed");
  const noFullFallback = ConcertMasterCore.resolveTicketPlan([
    { key: "discount", label: "學生優惠票", visible: true, enabled: true }
  ], [{ kind: "full", quantity: 2 }]);
  assert(noFullFallback.status === "unavailable", "full ticket incorrectly fell back when a recognizable type existed");
  assert(TixcraftAdapterV1.isActionLabel("BUY TICKETS"), "English Buy Tickets entry label was rejected");
  const waitingForSale = TixcraftAdapterV1.decide({
    routeKind: "detail",
    layoutSignature: "detail-v1",
    ready: true,
    busy: false,
    performanceListVisible: true,
    eventId: "demo",
    signals: {},
    entries: [{ key: "event:1", label: "立即購票", visible: true, enabled: true }],
    performances: [],
    seatModes: [],
    areas: [],
    tickets: [],
    acknowledgements: [],
    submits: []
  }, target, {});
  assert(waitingForSale.kind === "wait" && waitingForSale.state === ConcertMasterCore.STATES.PERFORMANCE_WAITING,
    "open event dropdown did not keep waiting for Find tickets");
  const productionArea = TixcraftAdapterV1.parseAreaDescriptor("B1看台103區5980 26 seat(s) remaining", "5980區");
  assert(productionArea.label === "B1看台103區" && productionArea.priceTwd === 5980, "production area parsing failed");
  const areaPlan = ConcertMasterCore.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ], target, [], true);
  assert(areaPlan.status === "resolved" && areaPlan.area.key === "a3", "priority or price enforcement failed");
  const firstEligibleArea = ConcertMasterCore.resolveAreaPlan([
    { key: "premium", label: "Premium", priceTwd: 5200, visible: true, enabled: true },
    { key: "first-match", label: "A2", priceTwd: 4700, visible: true, enabled: true },
    { key: "cheaper", label: "A3", priceTwd: 3800, visible: true, enabled: true }
  ], Object.assign({}, target, { areaPriorities: [] }), [], true);
  assert(firstEligibleArea.status === "resolved" && firstEligibleArea.area.key === "first-match", "optional area priority did not use page order");
  const priceFallback = ConcertMasterCore.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ], target, [], false);
  assert(priceFallback.status === "resolved" && priceFallback.area.key === "a3", "over-budget priority did not advance");
  const wildcardArea = ConcertMasterCore.resolveAreaPlan([
    { key: "a2", label: "A2", priceTwd: 4500, visible: true, enabled: true }
  ], Object.assign({}, target, { areaPriorities: [{ name: "A?" }] }), [], true);
  assert(wildcardArea.status === "unavailable", "area name was not matched exactly");
  const areaFirstDecision = TixcraftAdapterV1.decide(Object.assign({
    routeKind: "area",
    layoutSignature: "area-v1",
    ready: true,
    busy: false,
    eventId: "demo",
    signals: {},
    entries: [],
    performances: [],
    seatModes: [],
    tickets: [],
    submits: []
  }, { areas: [
    { key: "area:a2", label: "A2", priceTwd: 5200, visible: true, enabled: true },
    { key: "area:a3", label: "A3", priceTwd: 4500, visible: true, enabled: true }
  ] }), target, { allowAreaFallback: true, bestAvailableConfirmed: false });
  assert(areaFirstDecision.actionType === ConcertMasterCore.ACTIONS.SELECT_AREA, "area-first flow required premature seat-mode evidence");
  const noPriorityAreaDecision = TixcraftAdapterV1.decide(Object.assign({
    routeKind: "area",
    layoutSignature: "area-v1",
    ready: true,
    busy: false,
    eventId: "demo",
    signals: {},
    entries: [],
    performances: [],
    seatModes: [],
    tickets: [],
    submits: []
  }, { areas: [
    { key: "area:premium", label: "Premium", priceTwd: 5200, visible: true, enabled: true },
    { key: "area:first-match", label: "A2", priceTwd: 4700, visible: true, enabled: true },
    { key: "area:cheaper", label: "A3", priceTwd: 3800, visible: true, enabled: true }
  ] }), Object.assign({}, target, { areaPriorities: [] }), { allowAreaFallback: true, bestAvailableConfirmed: false });
  assert(noPriorityAreaDecision.targetKey === "area:first-match", "optional area priority did not select the first in-budget row");
  const seatHandoff = TixcraftAdapterV1.decide({
    routeKind: "seatSelection",
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
  }, target, {});
  assert(seatHandoff.kind === "handoff" && seatHandoff.signal === "seatMap", "seat picker did not hand off");
  const directQuantity = TixcraftAdapterV1.decide({
    routeKind: "ticket",
    layoutSignature: "ticket-v1",
    ready: true,
    busy: false,
    eventId: "demo",
    signals: {},
    entries: [],
    performances: [],
    seatModes: [],
    areas: [],
    tickets: [{
      key: "ticket:full",
      label: "全票",
      visible: true,
      enabled: true,
      selectedQuantity: 0,
      options: [{ value: "2", quantity: 2, enabled: true }]
    }],
    submits: []
  }, target, { bestAvailableConfirmed: false });
  assert(directQuantity.actionType === ConcertMasterCore.ACTIONS.SET_QUANTITY, "direct quantity flow required premature seat-mode evidence");
  const secondTicketQuantity = TixcraftAdapterV1.decide({
    routeKind: "ticket",
    layoutSignature: "ticket-v1",
    ready: true,
    busy: false,
    eventId: "demo",
    signals: {},
    entries: [],
    performances: [],
    seatModes: [],
    areas: [],
    tickets: [{
      key: "ticket:full",
      label: "搖滾區全票",
      visible: true,
      enabled: true,
      selectedQuantity: 2,
      options: [{ value: "2", quantity: 2, enabled: true }]
    }, {
      key: "ticket:discount",
      label: "學生優惠票",
      visible: true,
      enabled: true,
      selectedQuantity: 0,
      options: [{ value: "1", quantity: 1, enabled: true }]
    }],
    acknowledgements: [],
    submits: []
  }, Object.assign({}, target, { ticketRequests: [
    { kind: "full", quantity: 2 },
    { kind: "discount", quantity: 1 }
  ] }), {});
  assert(secondTicketQuantity.targetKey === "ticket:discount", "second requested ticket quantity was not selected");
  assert(TixcraftAdapterV1.postconditionMet(
    { actionType: ConcertMasterCore.ACTIONS.SET_QUANTITY, targetKey: "ticket:full" },
    { state: ConcertMasterCore.STATES.TICKET, actionType: ConcertMasterCore.ACTIONS.SET_QUANTITY, targetKey: "ticket:discount" }
  ), "quantity flow could not advance to its second ticket row");
  const acknowledgement = TixcraftAdapterV1.decide({
    routeKind: "ticket",
    layoutSignature: "ticket-v1",
    ready: true,
    busy: false,
    eventId: "demo",
    signals: { challenge: true },
    entries: [],
    performances: [],
    seatModes: [],
    areas: [],
    tickets: [{
      key: "ticket:full",
      label: "全票",
      visible: true,
      enabled: true,
      selectedQuantity: 2,
      options: [{ value: "2", quantity: 2, enabled: true }]
    }],
    acknowledgements: [{
      key: "acknowledgement:TicketForm_agree",
      label: "I hereby acknowledge",
      checked: false,
      visible: true,
      enabled: true
    }],
    verificationInputs: [{
      key: "verification:TicketForm_verifyCode",
      label: "Verification code",
      visible: true,
      enabled: true
    }],
    submits: []
  }, target, {});
  assert(acknowledgement.actionType === ConcertMasterCore.ACTIONS.ACKNOWLEDGE_TERMS, "required acknowledgement was not selected before verification handoff");
  const readyForVerification = TixcraftAdapterV1.decide({
    routeKind: "ticket",
    layoutSignature: "ticket-v1",
    ready: true,
    busy: false,
    eventId: "demo",
    signals: { challenge: true },
    entries: [],
    performances: [],
    seatModes: [],
    areas: [],
    tickets: [{
      key: "ticket:full",
      label: "全票",
      visible: true,
      enabled: true,
      selectedQuantity: 2,
      options: [{ value: "2", quantity: 2, enabled: true }]
    }],
    acknowledgements: [{
      key: "acknowledgement:TicketForm_agree",
      label: "I hereby acknowledge",
      checked: true,
      visible: true,
      enabled: true
    }],
    verificationInputs: [{
      key: "verification:TicketForm_verifyCode",
      label: "Verification code",
      visible: true,
      enabled: true
    }],
    submits: []
  }, target, {});
  assert(readyForVerification.signal === "challenge"
    && readyForVerification.targetKey === "verification:TicketForm_verifyCode",
  "verification handoff did not expose the exact CAPTCHA input as its focus target");
  assert(TixcraftAdapterV1.postconditionMet(
    { actionType: ConcertMasterCore.ACTIONS.SELECT_AREA },
    { state: ConcertMasterCore.STATES.SEAT_MODE }
  ), "area selection did not accept a subsequent seat-mode step");
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
      acknowledgements: [],
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
