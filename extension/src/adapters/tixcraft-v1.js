(function initializeTixcraftAdapter(root) {
  "use strict";

  const Core = root.ConcertMasterCore || (
    typeof require === "function" ? require("../shared/core.js") : null
  );
  if (!Core) throw new Error("ConcertMasterCore must load before the tixCraft adapter.");

  const ACTION_TEXT = /^(立即(訂購|購票)|購票|Buy now)$/iu;
  const SOLD_OUT_TEXT = /(已售完|售完|sold\s*out|暫無票券)/iu;
  const INELIGIBLE_TEXT = /(身障|輪椅|restricted|不適用)/iu;
  const BEST_AVAILABLE_TEXT = /^(電腦配位|best\s*available)$/iu;
  const SUBMIT_TEXT = /^(確認(張數|訂購|送出)?|下一步|送出|reserve|continue)$/iu;

  function routeKind(url) {
    let path = "";
    try {
      path = new URL(url).pathname.toLocaleLowerCase("en-US");
    } catch {
      return "unknown";
    }
    if (/\/ticket\/order(?:\/|$)/u.test(path) || /\/order\/confirm(?:\/|$)/u.test(path)) return "order";
    if (/\/ticket\/ticket(?:\/|$)/u.test(path)) return "ticket";
    if (/\/ticket\/area(?:\/|$)/u.test(path)) return "area";
    if (/\/activity\/game(?:\/|$)/u.test(path)) return "performance";
    if (/\/activity\/detail(?:\/|$)/u.test(path)) return "detail";
    return "unknown";
  }

  function uniqueElements(document, selectors) {
    const seen = new Set();
    const result = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!seen.has(element)) {
          seen.add(element);
          result.push(element);
        }
      }
    }
    return result;
  }

  function visible(element) {
    if (!element || !element.isConnected || element.hidden) return false;
    const view = element.ownerDocument?.defaultView;
    const style = view?.getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  }

  function enabled(element) {
    return Boolean(element)
      && !element.disabled
      && element.getAttribute?.("aria-disabled") !== "true"
      && !element.closest?.("[inert]")
      && !element.classList?.contains("disabled");
  }

  function textOf(element) {
    return Core.normalizeLabel(
      element?.getAttribute?.("aria-label")
      || element?.getAttribute?.("title")
      || element?.getAttribute?.("value")
      || element?.textContent
      || ""
    );
  }

  function keyFor(element, prefix, index) {
    const stable = element?.dataset?.gameId
      || element?.dataset?.areaId
      || element?.dataset?.ticketId
      || element?.getAttribute?.("value")
      || element?.id;
    return `${prefix}:${Core.normalizeLabel(stable || index)}`;
  }

  function associatedLabel(element) {
    if (!element) return "";
    if (element.labels?.length) return textOf(element.labels[0]);
    const id = element.id;
    if (id) {
      const candidate = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (candidate) return textOf(candidate);
    }
    return textOf(element.closest?.("label")) || textOf(element);
  }

  function eventLabelCandidates(document, kind) {
    const candidates = [];
    const add = (value) => {
      const label = Core.normalizeLabel(value);
      if (label && label.length <= 200 && !candidates.some((item) => Core.normalizedKey(item) === Core.normalizedKey(label))) {
        candidates.push(label);
      }
    };

    for (const selector of [
      "[data-event-title]", "h1.activity-title", ".activity-info h1", ".event-title",
      ".activity-name", ".game-info .title", ".breadcrumb [data-event-name]",
      "[itemprop='name']"
    ]) {
      for (const element of document.querySelectorAll(selector)) {
        if (visible(element)) add(element.getAttribute("content") || textOf(element));
      }
    }
    for (const selector of ["meta[property='og:title']", "meta[name='twitter:title']"]) {
      add(document.querySelector(selector)?.getAttribute("content"));
    }
    if (kind === "detail") {
      const headings = uniqueElements(document, ["main h1", "article h1", "h1"]).filter(visible);
      if (headings.length === 1) add(textOf(headings[0]));
    }

    const pageTitle = Core.normalizeLabel(document.title);
    if (pageTitle) {
      add(pageTitle);
      add(pageTitle.replace(/\s*[-|｜]\s*(?:tixCraft)?\s*拓元售票系統\s*$/iu, ""));
      add(pageTitle.replace(/^\s*(?:tixCraft)?\s*拓元售票系統\s*[-|｜]\s*/iu, ""));
      add(pageTitle.replace(/\s*[-|｜]\s*tixCraft\s*$/iu, ""));
    }
    return candidates;
  }

  function collectSignals(document, kind) {
    const hasVisible = (selectors) => uniqueElements(document, selectors).some(visible);
    const alerts = uniqueElements(document, ["[role='alert']", ".alert-danger", ".error-page", "main h1"])
      .filter(visible)
      .map(textOf)
      .join(" ");

    return {
      challenge: hasVisible([
        "iframe[src*='recaptcha']", "iframe[src*='hcaptcha']", ".g-recaptcha", ".h-captcha",
        "[data-sitekey]", "input[name*='captcha' i]", "img[src*='captcha' i]"
      ]),
      payment: hasVisible([
        "input[autocomplete='cc-number']", "input[name*='card_number' i]",
        "iframe[src*='payment' i]", "iframe[title*='card' i]"
      ]),
      verification: hasVisible([
        "input[autocomplete='one-time-code']", "input[name*='otp' i]",
        "[data-verification-step]", "form[action*='verify' i]"
      ]),
      terms: uniqueElements(document, ["label", "[role='checkbox']"]).some((element) => {
        const text = textOf(element);
        const checkbox = element.matches?.("input[type='checkbox']")
          ? element
          : element.querySelector?.("input[type='checkbox']");
        return visible(element) && /(同意|條款|terms)/iu.test(text) && checkbox && !checkbox.checked;
      }),
      blocked: /(unusual activity|異常活動|access denied|forbidden|too many requests|\b(?:401|403|429)\b)/iu.test(alerts),
      inventoryFailure: /(庫存不足|票券不足|張數不足|無法保留|insufficient inventory|not enough tickets)/iu.test(alerts),
      seatMap: hasVisible(["canvas.seat-map", "svg[data-seat-map]", "[data-seat-map]", ".seat-map-container canvas"])
    };
  }

  function layoutRoot(document, kind) {
    const selectors = {
      performance: ["#gameList", "[data-performance-list]", ".activity-game"],
      area: ["#zone", "[data-area-list]", ".area-list"],
      ticket: ["#ticketForm", "form[action*='/ticket/']", ".ticket-list"],
      order: ["[data-cart-held]", ".order-summary", "#order"],
      detail: ["[data-event-detail]", ".activity-detail", "#activity", ".activity-info"]
    };
    for (const selector of selectors[kind] || []) {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return null;
    }
    if (kind === "detail") {
      const entries = uniqueElements(document, ["a[href*='/activity/game/']"])
        .filter((element) => ACTION_TEXT.test(textOf(element)));
      if (entries.length === 1) return entries[0].closest("main, article, .content, .container") || entries[0].parentElement;
    }
    return null;
  }

  function layoutSignature(document, kind) {
    return layoutRoot(document, kind) ? `${kind}-v1` : null;
  }

  function collectPerformanceCandidates(document, scope = document) {
    const controls = uniqueElements(scope, [
      "a[data-game-id]", "button[data-game-id]", "a.btn-buy", "button.btn-buy", "a[href*='/ticket/area/']",
      "a[href*='/ticket/ticket/']", "button[data-action='buy']"
    ]).filter((element) => ACTION_TEXT.test(textOf(element)) || element.hasAttribute("data-game-id"));

    return controls.map((element, index) => {
      const row = element.closest("[data-performance], tr, li, .game-list, .activity-game") || element.parentElement;
      const labelElement = row?.querySelector?.("[data-performance-label], time, .date, .game-time, .performance-label");
      const label = Core.normalizeLabel(
        element.dataset?.performanceLabel
        || labelElement?.getAttribute?.("datetime")
        || textOf(labelElement)
        || textOf(row)
      );
      const rowText = textOf(row);
      return {
        key: keyFor(element, "performance", index),
        label,
        rawLabel: rowText,
        visible: visible(element),
        enabled: enabled(element) && !SOLD_OUT_TEXT.test(rowText),
        _element: element
      };
    });
  }

  function collectEntryCandidates(document) {
    return uniqueElements(document, [
      "a[href*='/activity/game/']", "a[data-action='buy']", "button[data-action='buy']"
    ]).filter((element) => ACTION_TEXT.test(textOf(element)))
      .map((element, index) => ({
        key: keyFor(element, "event", index),
        label: textOf(element),
        visible: visible(element),
        enabled: enabled(element) && !SOLD_OUT_TEXT.test(textOf(element.closest("section, main") || element)),
        _element: element
      }));
  }

  function collectSeatModes(document, scope = document) {
    const controls = uniqueElements(scope, [
      "input[type='radio'][name*='seat' i]", "button[data-seat-mode]", "[role='radio']",
      "label[for*='auto' i]", "label[for*='computer' i]"
    ]);
    const seen = new Set();
    return controls.flatMap((candidate, index) => {
      const input = candidate.matches?.("label") ? candidate.control || candidate.querySelector("input") : candidate;
      const identity = input || candidate;
      if (seen.has(identity)) return [];
      seen.add(identity);
      const visibleLabel = Array.from(input?.labels || []).find(visible);
      const dispatchElement = visible(candidate) ? candidate : visibleLabel || identity;
      const label = candidate.dataset?.seatModeLabel || associatedLabel(identity) || textOf(candidate);
      return [{
        key: keyFor(identity, "seat", index),
        label,
        selected: Boolean(identity.checked || identity.getAttribute?.("aria-checked") === "true"),
        visible: visible(dispatchElement),
        enabled: enabled(identity),
        _element: dispatchElement
      }];
    }).filter((mode) => mode.label);
  }

  function collectAreas(document, scope = document) {
    const controls = uniqueElements(scope, [
      "a[data-area-id]", "button[data-area-id]", "#zone a", ".area-list a", ".area-list button",
      "a[data-area-name]", "button[data-area-name]"
    ]);
    return controls.map((element, index) => {
      const row = element.closest("li, tr, [data-area-row]") || element;
      const rawLabel = textOf(row);
      const nameElement = row.querySelector?.("[data-area-name], .area-name, .zone-name");
      const label = Core.normalizeLabel(element.dataset?.areaName || textOf(nameElement) || textOf(element));
      const priceElement = row.querySelector?.("[data-price], .price, .area-price");
      const explicitPrice = element.dataset?.price || priceElement?.dataset?.price || textOf(priceElement);
      const priceTwd = explicitPrice ? Core.parseTwd(explicitPrice) : null;
      return {
        key: keyFor(element, "area", index),
        label,
        rawLabel,
        priceTwd,
        soldOut: SOLD_OUT_TEXT.test(rawLabel),
        ineligible: element.matches?.("[data-ineligible='true']") || INELIGIBLE_TEXT.test(rawLabel),
        visible: visible(element),
        enabled: enabled(element),
        _element: element
      };
    }).filter((area) => area.label);
  }

  function quantityFromOption(option) {
    const value = Core.normalizeLabel(option.value);
    const label = textOf(option);
    const match = (value || label).match(/\d+/u);
    return match ? Number(match[0]) : null;
  }

  function collectTickets(document, scope = document) {
    const selects = uniqueElements(scope, [
      "select[data-ticket-type]", "select[name*='TicketForm' i]", ".ticket-list select", "select.mobile-select"
    ]);
    return selects.map((element, index) => {
      const row = element.closest("tr, li, [data-ticket-row], .ticket-unit") || element.parentElement;
      const labelElement = row?.querySelector?.("[data-ticket-label], .ticket-name, th, .ticket-type");
      const label = Core.normalizeLabel(element.dataset?.ticketType || textOf(labelElement) || textOf(row));
      return {
        key: keyFor(element, "ticket", index),
        label,
        selectedQuantity: quantityFromOption(element.selectedOptions?.[0] || { value: element.value }),
        options: Array.from(element.options || []).map((option) => ({
          value: option.value,
          label: textOf(option),
          quantity: quantityFromOption(option),
          enabled: !option.disabled
        })),
        visible: visible(element),
        enabled: enabled(element),
        _element: element
      };
    }).filter((ticket) => ticket.label);
  }

  function collectSubmitControls(document, scope = document) {
    return uniqueElements(scope, [
      "button[type='submit']", "input[type='submit']", "button[data-action='reserve']", "#submitButton"
    ]).filter((element) => SUBMIT_TEXT.test(textOf(element)) || element.id === "submitButton")
      .map((element, index) => ({
        key: keyFor(element, "submit", index),
        label: textOf(element),
        visible: visible(element),
        enabled: enabled(element),
        _element: element
      }));
  }

  function collectSnapshot(document, url = document.location?.href || "") {
    const kind = routeKind(url);
    const pageRoot = layoutRoot(document, kind);
    const eventLabels = eventLabelCandidates(document, kind);
    return {
      adapterVersion: Core.ADAPTER_VERSION,
      routeKind: kind,
      layoutSignature: pageRoot ? `${kind}-v1` : null,
      ready: document.readyState !== "loading",
      busy: document.documentElement?.getAttribute?.("aria-busy") === "true"
        || uniqueElements(document, [".loading:empty", "[data-loading='true']"]).some(visible),
      eventLabel: eventLabels[0] || "",
      eventLabels,
      signals: collectSignals(document, kind),
      entries: collectEntryCandidates(document),
      performances: collectPerformanceCandidates(document, pageRoot || document),
      seatModes: collectSeatModes(document, pageRoot || document),
      areas: collectAreas(document, pageRoot || document),
      tickets: collectTickets(document, pageRoot || document),
      submits: collectSubmitControls(document, pageRoot || document)
    };
  }

  function stopDecision(reason, state = Core.STATES.UNKNOWN) {
    return { kind: "stop", state, confidence: 1, reason };
  }

  function handoffDecision(reason, signal, terminal = false) {
    return { kind: "handoff", state: Core.STATES.HANDOFF, confidence: 1, reason, signal, terminal };
  }

  function actionDecision(state, actionType, candidate, extra = {}) {
    return {
      kind: "action",
      state,
      confidence: 0.99,
      actionType,
      targetKey: candidate.key,
      candidate,
      ...extra
    };
  }

  function eventMatches(snapshot, target) {
    const labels = snapshot.eventLabels?.length ? snapshot.eventLabels : [snapshot.eventLabel];
    return labels.some((label) => Core.normalizedKey(label) === Core.normalizedKey(target.eventLabel));
  }

  function decide(snapshot, target, context = {}) {
    const signals = snapshot.signals || {};
    if (signals.blocked) return stopDecision("A block or unusual-activity page is visible.");
    if (signals.challenge) return handoffDecision("Verification challenge detected. Complete it yourself, then explicitly resume.", "challenge");
    if (signals.payment) return handoffDecision("Payment is outside the automation boundary.", "payment", true);
    if (signals.verification) return handoffDecision("Identity or OTP verification requires you.", "verification");
    if (signals.terms) return handoffDecision("Event terms require manual review and acceptance.", "terms");
    if (signals.seatMap) return handoffDecision("Graphical seat maps are manual-only.", "seatMap");

    if (snapshot.routeKind === "order" && snapshot.layoutSignature === "order-v1") {
      return { kind: "cart", state: Core.STATES.CART_HELD, confidence: 0.99, reason: "Cart reservation detected." };
    }
    if (!snapshot.ready || snapshot.busy) {
      return { kind: "wait", state: Core.STATES.LOADING, confidence: 0.99, reason: "Waiting for the page to become stable." };
    }
    if (!eventMatches(snapshot, target)) {
      return stopDecision(snapshot.eventLabel
        ? "The visible event does not exactly match the armed event."
        : "The event identity cannot be verified on this page.");
    }
    if (snapshot.layoutSignature !== `${snapshot.routeKind}-v1`) {
      return stopDecision("The page does not match a fixture-backed layout signature.");
    }

    if (snapshot.routeKind === "detail") {
      const entries = snapshot.entries || [];
      if (entries.length !== 1) {
        return stopDecision(entries.length
          ? "The event purchase entry is ambiguous."
          : "The event purchase entry is not present in this fixture-backed layout.");
      }
      const candidate = entries[0];
      if (!candidate.visible || !candidate.enabled) {
        return { kind: "wait", state: Core.STATES.EVENT_DETAIL, confidence: 0.99, reason: "The event purchase entry is not actionable yet." };
      }
      return actionDecision(Core.STATES.EVENT_DETAIL, Core.ACTIONS.OPEN_PERFORMANCES, candidate);
    }

    if (snapshot.routeKind === "performance") {
      const matches = snapshot.performances.filter((item) => Core.normalizedKey(item.label) === Core.normalizedKey(target.performanceLabel));
      if (matches.length !== 1) {
        return stopDecision(matches.length
          ? "The configured performance is ambiguous."
          : "The configured performance is not present in this fixture-backed layout.");
      }
      const candidate = matches[0];
      if (!candidate.visible || !candidate.enabled) {
        return { kind: "wait", state: Core.STATES.PERFORMANCE_WAITING, confidence: 0.99, reason: "The target performance is not actionable yet." };
      }
      return actionDecision(Core.STATES.PERFORMANCE, Core.ACTIONS.SELECT_PERFORMANCE, candidate);
    }

    const bestModes = snapshot.seatModes.filter((mode) => BEST_AVAILABLE_TEXT.test(Core.normalizeLabel(mode.label)));
    if (bestModes.length && !bestModes.some((mode) => mode.selected)) {
      if (bestModes.length !== 1) return stopDecision("Best Available does not resolve to exactly one control.");
      return actionDecision(Core.STATES.SEAT_MODE, Core.ACTIONS.SELECT_SEAT_MODE, bestModes[0]);
    }

    const bestAvailableVerified = context.bestAvailableConfirmed
      || (bestModes.length === 1 && bestModes[0].selected);

    if (snapshot.routeKind === "area") {
      if (!bestAvailableVerified) {
        return handoffDecision("Best Available cannot be verified for this area page.", "seatModeUnverified");
      }
      const plan = Core.resolveAreaPlan(
        snapshot.areas,
        target,
        context.attemptedAreaKeys || [],
        context.allowAreaFallback !== false
      );
      if (plan.status !== "resolved") {
        return handoffDecision(plan.reason, plan.status === "ambiguous" ? "ambiguousArea" : "areaUnavailable");
      }
      return actionDecision(Core.STATES.AREA, Core.ACTIONS.SELECT_AREA, plan.area, { resolvedAreaPlan: plan });
    }

    if (snapshot.routeKind === "ticket") {
      if (!bestAvailableVerified) {
        return handoffDecision("Best Available cannot be verified for this ticket page.", "seatModeUnverified");
      }
      const resolvedTicket = Core.resolveTicketType(snapshot.tickets, target.ticketTypePriorities);
      if (resolvedTicket.status !== "resolved") return handoffDecision(resolvedTicket.reason, "ticketUnavailable");
      const ticket = resolvedTicket.ticket;
      const option = ticket.options.find((item) => item.quantity === target.quantity && item.enabled);
      if (!option) return handoffDecision(`Quantity ${target.quantity} is not available for the approved ticket type.`, "quantityUnavailable");
      if (ticket.selectedQuantity !== target.quantity) {
        return actionDecision(Core.STATES.TICKET, Core.ACTIONS.SET_QUANTITY, ticket, { option });
      }
      const submits = snapshot.submits.filter((item) => item.visible && item.enabled);
      if (submits.length > 1) return stopDecision("The reservation control is ambiguous.");
      if (submits.length === 0) return handoffDecision("Quantity is set, but no single reservation control is available.", "submitUnavailable");
      return actionDecision(Core.STATES.RESERVATION_READY, Core.ACTIONS.SUBMIT_RESERVATION, submits[0]);
    }

    return stopDecision("This tixCraft layout is not recognized by the active adapter.");
  }

  function safeSnapshot(snapshot) {
    const copyItems = (items, extra = () => ({})) => items.map((item) => ({
      key: item.key,
      label: item.label,
      visible: item.visible,
      enabled: item.enabled,
      ...extra(item)
    }));
    return {
      adapterVersion: snapshot.adapterVersion,
      routeKind: snapshot.routeKind,
      layoutSignature: snapshot.layoutSignature,
      ready: snapshot.ready,
      eventLabel: snapshot.eventLabel,
      eventLabels: snapshot.eventLabels || (snapshot.eventLabel ? [snapshot.eventLabel] : []),
      signals: snapshot.signals,
      entries: copyItems(snapshot.entries || []),
      performances: copyItems(snapshot.performances),
      seatModes: copyItems(snapshot.seatModes, (item) => ({ selected: item.selected })),
      areas: copyItems(snapshot.areas, (item) => ({
        priceTwd: item.priceTwd,
        soldOut: item.soldOut,
        ineligible: item.ineligible
      })),
      tickets: copyItems(snapshot.tickets, (item) => ({
        selectedQuantity: item.selectedQuantity,
        options: item.options
      }))
    };
  }

  function postconditionMet(action, decision) {
    if (!action) return false;
    if (action.actionType === Core.ACTIONS.OPEN_PERFORMANCES) {
      return [Core.STATES.PERFORMANCE, Core.STATES.PERFORMANCE_WAITING, Core.STATES.HANDOFF].includes(decision.state);
    }
    if (action.actionType === Core.ACTIONS.SELECT_PERFORMANCE) {
      return [
        Core.STATES.SEAT_MODE, Core.STATES.AREA, Core.STATES.TICKET,
        Core.STATES.RESERVATION_READY, Core.STATES.HANDOFF, Core.STATES.CART_HELD
      ].includes(decision.state);
    }
    if (action.actionType === Core.ACTIONS.SELECT_SEAT_MODE) {
      return [Core.STATES.AREA, Core.STATES.TICKET, Core.STATES.RESERVATION_READY, Core.STATES.HANDOFF].includes(decision.state);
    }
    if (action.actionType === Core.ACTIONS.SELECT_AREA) {
      return [Core.STATES.TICKET, Core.STATES.RESERVATION_READY, Core.STATES.HANDOFF].includes(decision.state);
    }
    if (action.actionType === Core.ACTIONS.SET_QUANTITY) {
      return [Core.STATES.RESERVATION_READY, Core.STATES.HANDOFF].includes(decision.state);
    }
    if (action.actionType === Core.ACTIONS.SUBMIT_RESERVATION) {
      return [Core.STATES.CART_HELD, Core.STATES.HANDOFF].includes(decision.state);
    }
    return false;
  }

  const api = Object.freeze({
    VERSION: Core.ADAPTER_VERSION,
    collectSnapshot,
    decide,
    postconditionMet,
    routeKind,
    safeSnapshot
  });

  root.TixcraftAdapterV1 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
