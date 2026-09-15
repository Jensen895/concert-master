(function initializeTixcraftAdapter(root) {
  "use strict";

  const Core = root.ConcertMasterCore || (
    typeof require === "function" ? require("../shared/core.js") : null
  );
  if (!Core) throw new Error("ConcertMasterCore must load before the tixCraft adapter.");

  const ACTION_TEXT = /^(立即(訂購|購票)|購票|Buy now|Buy tickets|Find tickets|See tickets|Start ordering|お申込みへ進む)$/iu;
  const SOLD_OUT_TEXT = /(已售完|售完|sold\s*out|暫無票券)/iu;
  const INELIGIBLE_TEXT = /(身障|輪椅|restricted|不適用)/iu;
  const BEST_AVAILABLE_TEXT = /^(電腦配位|best\s*available)$/iu;
  const SUBMIT_TEXT = /^(確認(張數|訂購|送出)?|下一步|送出|reserve|continue)$/iu;
  const AREA_AVAILABILITY_SUFFIX = /\s*(?:\d+\s*seat\(s\)\s*remaining|(?:剩餘|尚餘)\s*\d+(?:\s*張)?|available|尚有票券|熱賣中|sold\s*out|已售完|售完)\s*$/iu;

  function routeKind(url) {
    return Core.tixcraftPageIdentity(url).routeKind;
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

  function isActionLabel(value) {
    return ACTION_TEXT.test(Core.normalizeLabel(value));
  }

  function keyFor(element, prefix, index) {
    const stable = element?.dataset?.gameId
      || element?.dataset?.areaId
      || element?.dataset?.ticketId
      || element?.getAttribute?.("data-href")
      || element?.id
      || element?.getAttribute?.("value");
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

  function collectSignals(document, kind) {
    const hasVisible = (selectors) => uniqueElements(document, selectors).some(visible);
    const alerts = uniqueElements(document, ["[role='alert']", ".alert-danger", ".error-page", "main h1"])
      .filter(visible)
      .map(textOf)
      .join(" ");

    return {
      challenge: hasVisible([
        "iframe[src*='recaptcha']", "iframe[src*='hcaptcha']", ".g-recaptcha", ".h-captcha",
        "[data-sitekey]", "input[name*='captcha' i]", "img[src*='captcha' i]",
        "#TicketForm_verifyCode", "#TicketForm_verifyCode-image"
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
        return visible(element)
          && /(同意|條款|terms)/iu.test(text)
          && checkbox
          && checkbox.id !== "TicketForm_agree"
          && !checkbox.checked;
      }),
      blocked: /(unusual activity|異常活動|access denied|forbidden|too many requests|\b(?:401|403|429)\b)/iu.test(alerts),
      inventoryFailure: /(庫存不足|票券不足|張數不足|無法保留|insufficient inventory|not enough tickets)/iu.test(alerts),
      seatMap: hasVisible([
        "canvas.seat-map", "svg[data-seat-map]", "[data-seat-map]", ".seat-map-container canvas",
        "iframe[src*='/ticket/select-seat/']"
      ])
    };
  }

  function layoutRoot(document, kind) {
    const selectors = {
      performance: ["#gameList", "[data-performance-list]", ".activity-game"],
      area: ["#zone", "[data-area-list]", ".zone.area-list", ".area_select .zone"],
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
        .filter((element) => isActionLabel(textOf(element)));
      if (entries.length === 1) return entries[0].closest("main, article, .content, .container") || entries[0].parentElement;
    }
    return null;
  }

  function layoutSignature(document, kind) {
    return layoutRoot(document, kind) ? `${kind}-v1` : null;
  }

  function collectPerformanceCandidates(document, scope = document) {
    const controls = uniqueElements(scope, [
      "a[data-game-id]", "button[data-game-id]", "a.btn-buy", "button.btn-buy", ".btn-next",
      "input[data-href]", "button[data-href]", "a[href*='/ticket/area/']",
      "a[href*='/ticket/ticket/']", "button[data-action='buy']",
      "a", "button", "[role='button']", "input[type='button']", "input[type='submit']"
    ]).filter((element) => isActionLabel(textOf(element))
      || element.hasAttribute("data-game-id")
      || element.matches(".btn-next, [data-href]"));

    return controls.map((element, index) => {
      const row = element.closest("[data-performance], tr, li, .game-list, .activity-game") || element.parentElement;
      const labelElement = row?.querySelector?.("[data-performance-date], [data-performance-label], time, .date, .game-time, .performance-label, td:first-child");
      const dateSelect = row?.querySelector?.("select[data-performance-date], select[name*='date' i], select[name*='game' i], select");
      const selectedOption = dateSelect?.selectedOptions?.[0]
        || dateSelect?.options?.[dateSelect.selectedIndex];
      const label = Core.normalizeLabel(
        element.dataset?.performanceLabel
        || labelElement?.getAttribute?.("datetime")
        || textOf(labelElement)
        || textOf(selectedOption)
        || textOf(row)
      );
      const rowText = textOf(row);
      const showDate = Core.calendarDateKey(
        element.dataset?.performanceDate
        || element.dataset?.performanceLabel
        || labelElement?.getAttribute?.("datetime")
        || textOf(labelElement)
        || textOf(selectedOption)
        || rowText
      );
      return {
        key: keyFor(element, "performance", index),
        label,
        showDate,
        rawLabel: rowText,
        visible: visible(element),
        enabled: enabled(element) && !SOLD_OUT_TEXT.test(rowText),
        _element: element
      };
    });
  }

  function collectEntryCandidates(document) {
    return uniqueElements(document, [
      "a[href*='/activity/game/']", "button[data-href*='/activity/game/']", "input[data-href*='/activity/game/']",
      "a[data-action='buy']", "button[data-action='buy']", "a.btn-buy", "button.btn-buy"
    ]).filter((element) => isActionLabel(textOf(element)))
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

  function parseAreaDescriptor(rawLabel, rawPrice) {
    const withoutAvailability = Core.normalizeLabel(rawLabel).replace(AREA_AVAILABILITY_SUFFIX, "").trim();
    let priceTwd = rawPrice === "" || rawPrice == null ? null : Core.parseTwd(rawPrice);
    if (priceTwd == null) {
      const markedPrice = withoutAvailability.match(/(?:NT\$?|TWD|新臺?台幣|\$)\s*[0-9][0-9,]*\s*$|[0-9][0-9,]*\s*元\s*$/iu);
      if (markedPrice) priceTwd = Core.parseTwd(markedPrice[0]);
    }

    let label = withoutAvailability;
    if (priceTwd != null) {
      const digits = String(priceTwd).split("").join(",?");
      const withoutPrice = label.replace(new RegExp(`\\s*(?:NT\\$?|TWD|\\$)?\\s*${digits}\\s*(?:元)?\\s*$`, "iu"), "").trim();
      if (withoutPrice) label = withoutPrice;
    }
    return { label: Core.normalizeLabel(label), priceTwd };
  }

  function textWithoutAvailability(element) {
    if (!element?.cloneNode) return textOf(element);
    const clone = element.cloneNode(true);
    for (const node of clone.querySelectorAll("font, .availability, [data-availability]")) node.remove();
    return Core.normalizeLabel(clone.textContent) || textOf(element);
  }

  function areaGroupPrice(row) {
    const list = row.closest?.("ul.area-list");
    if (!list) return null;
    const parent = list.parentElement;
    const groupLabel = Array.from(parent?.querySelectorAll?.(".zone-label") || [])
      .find((element) => element.dataset?.id && element.dataset.id === list.id)
      || (list.previousElementSibling?.matches?.(".zone-label") ? list.previousElementSibling : null);
    return groupLabel ? Core.parseTwd(textOf(groupLabel)) : null;
  }

  function areaMatchesSeatMode(row, document) {
    const selectedMode = document.querySelector("input[name='select_form']:checked")?.value;
    if (selectedMode === "auto" && row.classList?.contains("select_form_m")) return false;
    if (selectedMode === "manual" && row.classList?.contains("select_form_a")) return false;
    return true;
  }

  function collectAreas(document, scope = document) {
    const controls = uniqueElements(scope, [
      "a[data-area-id]", "button[data-area-id]", "#zone a", ".area-list a", ".area-list button",
      "li.select_form_b > a", "li.select_form_a > a",
      "a[data-area-name]", "button[data-area-name]"
    ]);
    return controls.map((element, index) => {
      const row = element.closest("li, tr, [data-area-row]") || element;
      const rawLabel = textOf(row);
      const nameElement = row.querySelector?.("[data-area-name], .area-name, .zone-name");
      const priceElement = row.querySelector?.("[data-price], .price, .area-price");
      const explicitPrice = element.dataset?.price
        || priceElement?.dataset?.price
        || textOf(priceElement)
        || areaGroupPrice(row);
      const descriptor = parseAreaDescriptor(
        element.dataset?.areaName || textWithoutAvailability(nameElement || element),
        explicitPrice
      );
      return {
        key: keyFor(element, "area", index),
        label: descriptor.label,
        rawLabel,
        priceTwd: descriptor.priceTwd,
        soldOut: SOLD_OUT_TEXT.test(rawLabel),
        ineligible: element.matches?.("[data-ineligible='true']") || INELIGIBLE_TEXT.test(rawLabel),
        visible: visible(element),
        enabled: enabled(element) && areaMatchesSeatMode(row, document),
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

  function collectAcknowledgements(document, scope = document) {
    return uniqueElements(scope, ["#TicketForm_agree"])
      .map((input, index) => {
        const visibleLabel = Array.from(input.labels || []).find(visible);
        const dispatchElement = visible(input) ? input : visibleLabel || input;
        return {
          key: keyFor(input, "acknowledgement", index),
          label: "I hereby acknowledge",
          checked: Boolean(input.checked),
          visible: visible(dispatchElement),
          enabled: enabled(input),
          _element: dispatchElement
        };
      });
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
    const identity = Core.tixcraftPageIdentity(url);
    const kind = identity.routeKind;
    const pageRoot = layoutRoot(document, kind);
    const performanceRoot = layoutRoot(document, "performance");
    return {
      adapterVersion: Core.ADAPTER_VERSION,
      routeKind: kind,
      eventId: identity.eventId,
      layoutSignature: pageRoot ? `${kind}-v1` : null,
      ready: document.readyState !== "loading",
      busy: document.documentElement?.getAttribute?.("aria-busy") === "true"
        || uniqueElements(document, [".loading:empty", "[data-loading='true']"]).some(visible),
      signals: collectSignals(document, kind),
      entries: collectEntryCandidates(document),
      performances: performanceRoot
        ? collectPerformanceCandidates(document, performanceRoot)
        : [],
      seatModes: collectSeatModes(document, pageRoot || document),
      areas: collectAreas(document, pageRoot || document),
      tickets: collectTickets(document, pageRoot || document),
      acknowledgements: collectAcknowledgements(document, pageRoot || document),
      submits: collectSubmitControls(document, pageRoot || document)
    };
  }

  function stopDecision(reason, state = Core.STATES.UNKNOWN) {
    return { kind: "stop", state, confidence: 1, reason };
  }

  function handoffDecision(reason, signal, terminal = false, extra = {}) {
    return { kind: "handoff", state: Core.STATES.HANDOFF, confidence: 1, reason, signal, terminal, ...extra };
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
    if (!target.eventId) return false;
    return snapshot.eventId === target.eventId;
  }

  function performanceDecision(snapshot, target, candidates = snapshot.performances || []) {
    const matches = candidates.filter((item) => item.showDate === target.showDate);
    if (matches.length !== 1) {
      return stopDecision(matches.length
        ? "More than one performance matches the selected show date."
        : "The selected show date is not present in this fixture-backed layout.");
    }
    const candidate = matches[0];
    if (!candidate.visible || !candidate.enabled) {
      return { kind: "wait", state: Core.STATES.PERFORMANCE_WAITING, confidence: 0.99, reason: "The target performance is not actionable yet." };
    }
    return actionDecision(Core.STATES.PERFORMANCE, Core.ACTIONS.SELECT_PERFORMANCE, candidate);
  }

  function decide(snapshot, target, context = {}) {
    const signals = snapshot.signals || {};
    if (signals.blocked) return stopDecision("A block or unusual-activity page is visible.");
    if (signals.challenge && snapshot.routeKind !== "ticket") {
      return handoffDecision("Verification challenge detected. Complete it yourself, then explicitly resume.", "challenge");
    }
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
      return stopDecision(snapshot.eventId
        ? "This page belongs to a different event than the armed event detail page."
        : "The event identity cannot be verified from this page URL.");
    }
    if (snapshot.routeKind === "seatSelection") {
      return handoffDecision("Seat selection requires you to choose the seat manually.", "seatMap");
    }
    if (snapshot.layoutSignature !== `${snapshot.routeKind}-v1`) {
      return stopDecision("The page does not match a fixture-backed layout signature.");
    }

    if (snapshot.routeKind === "detail") {
      const visiblePerformances = (snapshot.performances || []).filter((item) => item.visible);
      if (visiblePerformances.length) return performanceDecision(snapshot, target, visiblePerformances);

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
      return performanceDecision(snapshot, target);
    }

    const bestModes = snapshot.seatModes.filter((mode) => BEST_AVAILABLE_TEXT.test(Core.normalizeLabel(mode.label)));
    if (bestModes.length && !bestModes.some((mode) => mode.selected)) {
      if (bestModes.length !== 1) return stopDecision("Best Available does not resolve to exactly one control.");
      return actionDecision(Core.STATES.SEAT_MODE, Core.ACTIONS.SELECT_SEAT_MODE, bestModes[0]);
    }

    if (snapshot.routeKind === "area") {
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
      const ticketPlan = Core.resolveTicketPlan(snapshot.tickets, target.ticketRequests);
      if (ticketPlan.status !== "resolved") return handoffDecision(ticketPlan.reason, "ticketUnavailable");
      for (const assignment of ticketPlan.assignments) {
        const { request, ticket } = assignment;
        const option = ticket.options.find((item) => item.quantity === request.quantity && item.enabled);
        if (!option) {
          return handoffDecision(
            `Quantity ${request.quantity} is not available for ${ticket.label}.`,
            "quantityUnavailable"
          );
        }
        if (ticket.selectedQuantity !== request.quantity) {
          return actionDecision(Core.STATES.TICKET, Core.ACTIONS.SET_QUANTITY, ticket, { option });
        }
      }

      const acknowledgements = snapshot.acknowledgements || [];
      if (acknowledgements.length > 1) return stopDecision("The required acknowledgement control is ambiguous.");
      if (acknowledgements.length === 1) {
        const acknowledgement = acknowledgements[0];
        if (!acknowledgement.visible || !acknowledgement.enabled) {
          return handoffDecision("The required acknowledgement is not actionable.", "acknowledgementUnavailable");
        }
        if (!acknowledgement.checked) {
          return actionDecision(
            Core.STATES.ACKNOWLEDGEMENT,
            Core.ACTIONS.ACKNOWLEDGE_TERMS,
            acknowledgement
          );
        }
      }

      if (signals.challenge) {
        return handoffDecision(
          "Enter the verification code, review the page, and submit manually. Concert Master will not read or fill the code.",
          "challenge"
        );
      }

      const submits = snapshot.submits.filter((item) => item.visible);
      if (submits.length > 1) return stopDecision("The reservation control is ambiguous.");
      if (submits.length === 0) return handoffDecision("Quantity and acknowledgement are ready, but the manual submit control is unavailable.", "submitUnavailable");
      return handoffDecision(
        "Quantity and acknowledgement are ready. Review the page and submit manually.",
        "manualSubmit",
        false,
        { candidate: submits[0], targetKey: submits[0].key }
      );
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
      eventId: snapshot.eventId,
      layoutSignature: snapshot.layoutSignature,
      ready: snapshot.ready,
      signals: snapshot.signals,
      entries: copyItems(snapshot.entries || []),
      performances: copyItems(snapshot.performances, (item) => ({ showDate: item.showDate })),
      seatModes: copyItems(snapshot.seatModes, (item) => ({ selected: item.selected })),
      areas: copyItems(snapshot.areas, (item) => ({
        priceTwd: item.priceTwd,
        soldOut: item.soldOut,
        ineligible: item.ineligible
      })),
      tickets: copyItems(snapshot.tickets, (item) => ({
        selectedQuantity: item.selectedQuantity,
        options: item.options
      })),
      acknowledgements: copyItems(snapshot.acknowledgements || [], (item) => ({ checked: item.checked }))
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
      return [Core.STATES.SEAT_MODE, Core.STATES.TICKET, Core.STATES.RESERVATION_READY, Core.STATES.HANDOFF].includes(decision.state);
    }
    if (action.actionType === Core.ACTIONS.SET_QUANTITY) {
      if (decision.state === Core.STATES.TICKET && decision.actionType === Core.ACTIONS.SET_QUANTITY) {
        return decision.targetKey !== action.targetKey;
      }
      return [Core.STATES.ACKNOWLEDGEMENT, Core.STATES.RESERVATION_READY, Core.STATES.HANDOFF].includes(decision.state);
    }
    if (action.actionType === Core.ACTIONS.ACKNOWLEDGE_TERMS) {
      return [Core.STATES.RESERVATION_READY, Core.STATES.HANDOFF].includes(decision.state);
    }
    return false;
  }

  const api = Object.freeze({
    VERSION: Core.ADAPTER_VERSION,
    collectSnapshot,
    decide,
    isActionLabel,
    parseAreaDescriptor,
    postconditionMet,
    routeKind,
    safeSnapshot
  });

  root.TixcraftAdapterV1 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
