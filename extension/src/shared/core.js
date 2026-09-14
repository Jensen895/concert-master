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
    SUBMIT_RESERVATION: "submitReservation"
  });

  const PERMISSIONS = Object.freeze({
    [ACTIONS.OPEN_PERFORMANCES]: "openPerformances",
    [ACTIONS.SELECT_PERFORMANCE]: "selectPerformance",
    [ACTIONS.SELECT_SEAT_MODE]: "selectSeatMode",
    [ACTIONS.SELECT_AREA]: "selectArea",
    [ACTIONS.SET_QUANTITY]: "setQuantity",
    [ACTIONS.SUBMIT_RESERVATION]: "submitReservation"
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
      if (parts[0] === "ticket" && ["area", "ticket"].includes(parts[1])) {
        return { routeKind: parts[1], eventId: decode(parts[2]) };
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

  // Patterns are deliberately a small glob language: '*' matches within a
  // visible label and '?' matches one character. Regex syntax is not accepted.
  function compileNamePattern(pattern) {
    const normalized = normalizeLabel(pattern).replace(/\*+/gu, "*");
    if (!normalized || normalized.length > 80) {
      throw new Error("Area patterns must contain between 1 and 80 characters.");
    }
    let source = "";
    for (const character of normalized) {
      if (character === "*") source += ".*";
      else if (character === "?") source += ".";
      else source += character.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    }
    return new RegExp(`^(?:${source})$`, "iu");
  }

  function patternMatches(pattern, label) {
    const normalized = normalizeLabel(label);
    return normalized.length <= 256 && compileNamePattern(pattern).test(normalized);
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
    const quantity = finiteInteger(target.quantity, 1, 10);
    const maximumUnitPriceTwd = target.maximumUnitPriceTwd === "" || target.maximumUnitPriceTwd == null
      ? undefined
      : finiteInteger(target.maximumUnitPriceTwd, 1, 1_000_000);
    const areaPriorities = Array.isArray(target.areaPriorities)
      ? target.areaPriorities.slice(0, 12).map((rawArea) => {
          const displayLabel = normalizeLabel(rawArea?.displayLabel);
          const namePattern = normalizeLabel(rawArea?.namePattern || displayLabel);
          const cap = rawArea?.maximumUnitPriceTwd === "" || rawArea?.maximumUnitPriceTwd == null
            ? undefined
            : finiteInteger(rawArea.maximumUnitPriceTwd, 1, 1_000_000);
          return { displayLabel, namePattern, maximumUnitPriceTwd: cap };
        })
      : [];
    const ticketTypePriorities = Array.isArray(target.ticketTypePriorities)
      ? target.ticketTypePriorities.map(normalizeLabel).filter(Boolean).slice(0, 12)
      : [];

    const errors = [];
    if (!rawShowDate) errors.push("Show date is required.");
    else if (!showDate) errors.push("Show date must be a valid calendar date.");
    if (eventId.length > 120) errors.push("The event page identifier is too long.");
    if (quantity == null) errors.push("Quantity must be an integer from 1 to 10.");
    if (target.seatMode !== "bestAvailable") errors.push("Only Best Available is supported.");
    if (!areaPriorities.length) errors.push("At least one area preference is required.");
    for (const area of areaPriorities) {
      if (!area.displayLabel || !area.namePattern) {
        errors.push("Every area preference needs a label and pattern.");
        continue;
      }
      if (area.displayLabel.length > 120) errors.push("Area labels must be 120 characters or fewer.");
      try {
        compileNamePattern(area.namePattern);
      } catch (error) {
        errors.push(error.message);
      }
      if (area.maximumUnitPriceTwd === null) errors.push(`Invalid price cap for ${area.displayLabel}.`);
    }
    if (!ticketTypePriorities.length) errors.push("At least one ticket type is required.");
    if (ticketTypePriorities.some((label) => label.length > 120)) errors.push("Ticket type labels must be 120 characters or fewer.");
    if (maximumUnitPriceTwd === null) errors.push("The overall price cap is invalid.");

    return {
      ok: errors.length === 0,
      errors,
      value: {
        showDate,
        eventId: eventId || undefined,
        quantity,
        seatMode: "bestAvailable",
        areaPriorities,
        ticketTypePriorities,
        maximumUnitPriceTwd
      }
    };
  }

  function effectivePriceCap(target, preference) {
    const caps = [target.maximumUnitPriceTwd, preference.maximumUnitPriceTwd]
      .filter((value) => Number.isFinite(value));
    return caps.length ? Math.min(...caps) : undefined;
  }

  function resolveAreaPlan(areas, target, attemptedAreaKeys = [], allowFallback = true) {
    const attempted = new Set(attemptedAreaKeys);
    const outcomes = [];

    for (let index = 0; index < target.areaPriorities.length; index += 1) {
      const preference = target.areaPriorities[index];
      const matches = areas.filter((area) => patternMatches(preference.namePattern, area.label));

      if (matches.length > 1) {
        return {
          status: "ambiguous",
          reason: `“${preference.displayLabel}” matched ${matches.length} visible areas.`,
          outcomes
        };
      }

      if (matches.length === 0) {
        outcomes.push({ preference: preference.displayLabel, status: "notFound" });
        if (!allowFallback) break;
        continue;
      }

      const area = matches[0];
      const cap = effectivePriceCap(target, preference);
      let status = "eligible";
      if (attempted.has(area.key)) status = "alreadyAttempted";
      else if (!area.visible || !area.enabled || area.soldOut || area.ineligible) status = "unavailable";
      else if (area.priceTwd == null) status = "priceUnknown";
      else if (cap != null && area.priceTwd > cap) status = "overBudget";

      outcomes.push({
        preference: preference.displayLabel,
        status,
        areaKey: area.key,
        resolvedLabel: area.label,
        priceTwd: area.priceTwd,
        cap
      });

      if (status === "eligible") {
        return { status: "resolved", area, preferenceIndex: index, outcomes };
      }
      if (!allowFallback) break;
    }

    return {
      status: "unavailable",
      reason: allowFallback
        ? "None of the approved area preferences is currently valid."
        : "The first area preference is not currently valid and fallback is disabled.",
      outcomes
    };
  }

  function resolveTicketType(tickets, priorities) {
    for (const priority of priorities) {
      const matches = tickets.filter((ticket) => normalizedKey(ticket.label) === normalizedKey(priority));
      if (matches.length > 1) {
        return { status: "ambiguous", reason: `“${priority}” matched more than one ticket type.` };
      }
      if (matches.length === 1) {
        const ticket = matches[0];
        if (!ticket.visible || !ticket.enabled) continue;
        return { status: "resolved", ticket };
      }
    }
    return { status: "unavailable", reason: "No approved ticket type is available." };
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

  function sameResolvedAreaPlan(authorization, plan) {
    if (!authorization || plan.status !== "resolved") return false;
    return authorization.adapterVersion === ADAPTER_VERSION
      && authorization.areaKey === plan.area.key
      && normalizeLabel(authorization.label) === normalizeLabel(plan.area.label)
      && authorization.priceTwd === plan.area.priceTwd;
  }

  const api = Object.freeze({
    ACTIONS,
    ADAPTER_VERSION,
    ALLOWED_ORIGINS,
    MODES,
    PERMISSIONS,
    STATES,
    actionId,
    allowedOrigin,
    calendarDateKey,
    compileNamePattern,
    normalizeLabel,
    normalizedKey,
    parseTwd,
    patternMatches,
    permissionForAction,
    redactEvent,
    resolveAreaPlan,
    resolveTicketType,
    sameResolvedAreaPlan,
    sanitizeTarget,
    tixcraftPageIdentity
  });

  root.ConcertMasterCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
