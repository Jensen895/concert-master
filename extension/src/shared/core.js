(function initializeConcertMasterCore(root) {
  "use strict";

  const ADAPTER_VERSION = "tixcraft-v1";
  const ALLOWED_ORIGINS = Object.freeze([
    "https://tixcraft.com",
    "https://www.tixcraft.com",
    "http://localhost:4173"
  ]);

  const MODES = Object.freeze({
    OFF: "off",
    DRY_RUN: "dryRun",
    ASSIST: "assist",
    BOUNDED_AUTO: "boundedAuto"
  });

  const STATES = Object.freeze({
    LOADING: "loading",
    EVENT_DETAIL: "eventDetail",
    PERFORMANCE: "performanceSelection",
    PERFORMANCE_WAITING: "performanceWaiting",
    SEAT_MODE: "seatMode",
    AREA: "areaSelection",
    TICKET: "ticketSelection",
    ACKNOWLEDGEMENT: "acknowledgement",
    RESERVATION_READY: "reservationReady",
    CART_HELD: "cartHeld",
    HANDOFF: "handoff",
    UNKNOWN: "unknown"
  });

  const ACTIONS = Object.freeze({
    OPEN_PERFORMANCES: "openPerformances",
    SELECT_PERFORMANCE: "selectPerformance",
    SELECT_SEAT_MODE: "selectSeatMode",
    SELECT_AREA: "selectArea",
    SET_QUANTITY: "setQuantity",
    ACKNOWLEDGE_TERMS: "acknowledgeTerms"
  });

  const PERMISSIONS = Object.freeze({
    [ACTIONS.OPEN_PERFORMANCES]: "openPerformances",
    [ACTIONS.SELECT_PERFORMANCE]: "selectPerformance",
    [ACTIONS.SELECT_SEAT_MODE]: "selectSeatMode",
    [ACTIONS.SELECT_AREA]: "selectArea",
    [ACTIONS.SET_QUANTITY]: "setQuantity",
    [ACTIONS.ACKNOWLEDGE_TERMS]: "acknowledgeTerms"
  });

  const TICKET_KINDS = Object.freeze({
    FULL: "full",
    DISCOUNT: "discount"
  });

  const TICKET_KIND_LABELS = Object.freeze({
    full: "全票",
    discount: "優惠票"
  });

  function normalizeLabel(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
  }

  function normalizedKey(value) {
    return normalizeLabel(value).toLocaleLowerCase("zh-Hant-TW");
  }

  function calendarDateKey(value) {
    const text = normalizeLabel(value);
    const match = text.match(/(?:^|[^0-9])(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:\s*日)?(?![0-9])/u);
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function tixcraftPageIdentity(url) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const decode = (value) => {
        try {
          return decodeURIComponent(value || "");
        } catch {
          return "";
        }
      };
      if (parts[0] === "activity" && ["detail", "game"].includes(parts[1])) {
        return { routeKind: parts[1] === "detail" ? "detail" : "performance", eventId: decode(parts[2]) };
      }
      if (parts[0] === "ticket" && ["area", "ticket", "select-seat"].includes(parts[1])) {
        return {
          routeKind: parts[1] === "select-seat" ? "seatSelection" : parts[1],
          eventId: decode(parts[2])
        };
      }
      if ((parts[0] === "ticket" && parts[1] === "order") || (parts[0] === "order" && parts[1] === "confirm")) {
        return { routeKind: "order", eventId: "" };
      }
    } catch {
      // Invalid URLs are handled by the caller's existing fail-closed path.
    }
    return { routeKind: "unknown", eventId: "" };
  }

  function parseTwd(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
    }
    const text = normalizeLabel(value);
    const match = text.match(/(?:NT\$?|TWD|新臺?台幣)?\s*\$?\s*([0-9][0-9,]*)/iu);
    if (!match) return null;
    const parsed = Number(match[1].replaceAll(",", ""));
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function finiteInteger(value, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return null;
    return parsed;
  }

  function sanitizeTarget(raw) {
    const target = raw && typeof raw === "object" ? raw : {};
    const rawShowDate = normalizeLabel(target.showDate || target.performanceLabel);
    const showDate = calendarDateKey(rawShowDate);
    const eventId = normalizeLabel(target.eventId);
    const maximumUnitPriceTwd = target.maximumUnitPriceTwd === "" || target.maximumUnitPriceTwd == null
      ? undefined
      : finiteInteger(target.maximumUnitPriceTwd, 1, 1_000_000);
    const areaPriorities = Array.isArray(target.areaPriorities)
      ? target.areaPriorities.slice(0, 12).map((rawArea) => {
          const legacyName = rawArea && typeof rawArea === "object"
            ? rawArea.namePattern || rawArea.displayLabel
            : rawArea;
          return { name: normalizeLabel(rawArea?.name || legacyName) };
        })
      : [];
    const legacyTicketPriorities = Array.isArray(target.ticketTypePriorities)
      ? target.ticketTypePriorities.map(normalizeLabel).filter(Boolean)
      : [];
    const legacyTicketKind = legacyTicketPriorities.some((label) => normalizedKey(label).includes(normalizedKey(TICKET_KIND_LABELS[TICKET_KINDS.DISCOUNT])))
      && !legacyTicketPriorities.some((label) => normalizedKey(label).includes(normalizedKey(TICKET_KIND_LABELS[TICKET_KINDS.FULL])))
      ? TICKET_KINDS.DISCOUNT
      : TICKET_KINDS.FULL;
    const rawTicketRequests = Array.isArray(target.ticketRequests)
      ? target.ticketRequests
      : target.quantity == null
        ? []
        : [{ kind: legacyTicketKind, quantity: target.quantity }];
    const ticketRequests = rawTicketRequests.slice(0, 2).map((request) => ({
      kind: normalizeLabel(request?.kind),
      quantity: finiteInteger(request?.quantity, 1, 10)
    }));

    const errors = [];
    if (!rawShowDate) errors.push("Show date is required.");
    else if (!showDate) errors.push("Show date must be a valid calendar date.");
    if (eventId.length > 120) errors.push("The event page identifier is too long.");
    if (target.seatMode !== "bestAvailable") errors.push("Only Best Available is supported.");
    if (!areaPriorities.length) errors.push("At least one area preference is required.");
    for (const area of areaPriorities) {
      if (!area.name) {
        errors.push("Every area preference needs an area name.");
        continue;
      }
      if (area.name.length > 120) errors.push("Area names must be 120 characters or fewer.");
    }
    if (!ticketRequests.length) errors.push("Select at least one ticket type.");
    if (rawTicketRequests.length > 2) errors.push("Only Full Ticket and Discount Ticket requests are supported.");
    if (ticketRequests.some((request) => !Object.values(TICKET_KINDS).includes(request.kind))) {
      errors.push("Ticket type must be Full Ticket or Discount Ticket.");
    }
    if (new Set(ticketRequests.map((request) => request.kind)).size !== ticketRequests.length) {
      errors.push("Each ticket type can only be selected once.");
    }
    if (ticketRequests.some((request) => request.quantity == null)) {
      errors.push("Each selected ticket quantity must be an integer from 1 to 10.");
    }
    if (maximumUnitPriceTwd == null) errors.push("Maximum ticket price is required and must be a positive whole number.");

    return {
      ok: errors.length === 0,
      errors,
      value: {
        showDate,
        eventId: eventId || undefined,
        seatMode: "bestAvailable",
        areaPriorities,
        ticketRequests,
        maximumUnitPriceTwd
      }
    };
  }

  function resolveAreaPlan(areas, target, attemptedAreaKeys = [], allowFallback = true) {
    const attempted = new Set(attemptedAreaKeys);
    const outcomes = [];

    for (let index = 0; index < target.areaPriorities.length; index += 1) {
      const preference = target.areaPriorities[index];
      const preferenceName = normalizeLabel(preference.name || preference.namePattern || preference.displayLabel);
      const matches = areas.filter((area) => normalizedKey(area.label) === normalizedKey(preferenceName));

      if (matches.length > 1) {
        return {
          status: "ambiguous",
          reason: `“${preferenceName}” matched ${matches.length} visible areas.`,
          outcomes
        };
      }

      if (matches.length === 0) {
        outcomes.push({ preference: preferenceName, status: "notFound" });
        if (!allowFallback) break;
        continue;
      }

      const area = matches[0];
      const cap = target.maximumUnitPriceTwd;
      let status = "eligible";
      if (attempted.has(area.key)) status = "alreadyAttempted";
      else if (!area.visible || !area.enabled || area.soldOut || area.ineligible) status = "unavailable";
      else if (area.priceTwd == null) status = "priceUnknown";
      else if (cap != null && area.priceTwd > cap) status = "overBudget";

      outcomes.push({
        preference: preferenceName,
        status,
        areaKey: area.key,
        resolvedLabel: area.label,
        priceTwd: area.priceTwd,
        cap
      });

      if (status === "eligible") {
        return { status: "resolved", area, preferenceIndex: index, outcomes };
      }
      // An over-budget area is never a valid first choice. Continue down the
      // explicit priority list even when fallback for other failures is off.
      if (!allowFallback && status !== "overBudget") break;
    }

    return {
      status: "unavailable",
      reason: allowFallback
        ? "None of the approved area preferences is currently valid."
        : "The first area preference is not currently valid and fallback is disabled.",
      outcomes
    };
  }

  function ticketKindForLabel(label) {
    const key = normalizedKey(label);
    if (key.includes(normalizedKey(TICKET_KIND_LABELS[TICKET_KINDS.FULL]))) return TICKET_KINDS.FULL;
    if (key.includes(normalizedKey(TICKET_KIND_LABELS[TICKET_KINDS.DISCOUNT]))) return TICKET_KINDS.DISCOUNT;
    return null;
  }

  function resolveTicketPlan(tickets, ticketRequests) {
    const availableTickets = Array.isArray(tickets) ? tickets : [];
    const requests = Array.isArray(ticketRequests) ? ticketRequests : [];
    const hasDistinguishableTypes = availableTickets.some((ticket) => ticketKindForLabel(ticket.label));
    const assignments = [];
    const usedKeys = new Set();

    for (const request of requests) {
      const typeLabel = TICKET_KIND_LABELS[request.kind] || request.kind;
      let matches = availableTickets.filter((ticket) => ticketKindForLabel(ticket.label) === request.kind);
      if (request.kind === TICKET_KINDS.FULL && !hasDistinguishableTypes && availableTickets.length) {
        matches = [availableTickets[0]];
      }

      if (matches.length > 1) {
        return {
          status: "ambiguous",
          reason: `“${typeLabel}” partially matched more than one ticket row.`,
          assignments
        };
      }
      if (matches.length === 0) {
        return {
          status: "unavailable",
          reason: `No ticket row containing “${typeLabel}” is available.`,
          assignments
        };
      }

      const ticket = matches[0];
      if (usedKeys.has(ticket.key)) {
        return { status: "ambiguous", reason: "Two requested ticket types resolved to the same row.", assignments };
      }
      if (!ticket.visible || !ticket.enabled) {
        return { status: "unavailable", reason: `The “${typeLabel}” ticket row is not currently available.`, assignments };
      }
      assignments.push({ request, ticket });
      usedKeys.add(ticket.key);
    }

    return requests.length
      ? { status: "resolved", assignments }
      : { status: "unavailable", reason: "No ticket type was selected.", assignments };
  }

  function permissionForAction(actionType) {
    return PERMISSIONS[actionType] || null;
  }

  function actionId(pageGeneration, decision) {
    const targetKey = decision.targetKey || "none";
    return `${pageGeneration}:${decision.state}:${decision.actionType}:${targetKey}`;
  }

  function allowedOrigin(url) {
    try {
      return ALLOWED_ORIGINS.includes(new URL(url).origin);
    } catch {
      return false;
    }
  }

  function redactEvent(event) {
    const allowed = [
      "type", "state", "actionType", "reason", "outcome", "adapterVersion",
      "mutationToObservationMs", "observationToDecisionMs", "decisionToDispatchMs",
      "actionToPostconditionMs", "confidence", "at"
    ];
    const redacted = {};
    for (const key of allowed) {
      if (event[key] !== undefined) redacted[key] = event[key];
    }
    return redacted;
  }

  const api = Object.freeze({
    ACTIONS,
    ADAPTER_VERSION,
    ALLOWED_ORIGINS,
    MODES,
    PERMISSIONS,
    STATES,
    TICKET_KINDS,
    actionId,
    allowedOrigin,
    calendarDateKey,
    normalizeLabel,
    normalizedKey,
    parseTwd,
    permissionForAction,
    redactEvent,
    resolveAreaPlan,
    resolveTicketPlan,
    sanitizeTarget,
    tixcraftPageIdentity
  });

  root.ConcertMasterCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
