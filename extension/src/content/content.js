(function initializeConcertMasterContent(root) {
  "use strict";

  const Core = root.ConcertMasterCore;
  const Adapter = root.TixcraftAdapterV1;
  if (!Core || !Adapter) return;

  const POSTCONDITION_TIMEOUT_MS = 8_000;
  const MIN_STABLE_MS = 16;
  const state = {
    session: null,
    observer: null,
    frameId: 0,
    deadlineTimer: 0,
    pageGeneration: crypto.randomUUID(),
    lastMutationAt: performance.now(),
    pendingAction: null,
    locked: false,
    stable: null,
    lastReportedSignature: "",
    lastPresentedSignature: "",
    lastHandoffSignature: "",
    inventoryFailureKey: "",
    overlayHost: null,
    highlighted: null,
    stopped: false
  };

  function send(message) {
    try {
      const payload = state.session && !message.sessionId
        ? { ...message, sessionId: state.session.id }
        : message;
      const result = chrome.runtime.sendMessage(payload);
      if (result?.catch) result.catch(() => {});
      return result;
    } catch {
      return null;
    }
  }

  function monotonicNow() {
    return performance.timeOrigin + performance.now();
  }

  function clearHighlight() {
    if (state.highlighted?.isConnected) state.highlighted.classList.remove("cm-pilot-target");
    state.highlighted = null;
  }

  function clearOverlay() {
    clearHighlight();
    state.overlayHost?.remove();
    state.overlayHost = null;
  }

  // attachShadow({mode:"closed"}) hides shadowRoot, including from this script on
  // later calls. Build the card through this helper and retain only its ShadowRoot.
  function ensureOverlay(kind, title, detail) {
    if (!document.documentElement) return;
    if (!state.overlayHost) {
      const host = document.createElement("div");
      host.id = "concert-master-pilot-status";
      const shadow = host.attachShadow({ mode: "closed" });
      host.__cmShadow = shadow;
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .card { position: fixed; z-index: 2147483647; right: 18px; top: 18px; width: 294px;
            box-sizing: border-box; padding: 13px 14px; color: #f8f7ff; border: 1px solid rgb(255 255 255 / 13%);
            border-radius: 14px; background: rgb(22 20 31 / 96%); box-shadow: 0 14px 42px rgb(0 0 0 / 35%);
            font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; backdrop-filter: blur(14px); }
          .top { display: flex; gap: 8px; align-items: center; margin-bottom: 5px; }
          .dot { width: 8px; height: 8px; border-radius: 50%; background: #a78bfa; box-shadow: 0 0 0 4px rgb(167 139 250 / 14%); }
          .card[data-kind="handoff"] .dot { background: #fbba45; box-shadow: 0 0 0 4px rgb(251 186 69 / 15%); }
          .card[data-kind="success"] .dot { background: #4ade80; box-shadow: 0 0 0 4px rgb(74 222 128 / 15%); }
          strong { font-size: 13px; letter-spacing: .01em; }
          p { margin: 0; color: #c8c5d4; }
        </style>
        <section class="card" role="status" aria-live="polite">
          <div class="top"><span class="dot"></span><strong></strong></div><p></p>
        </section>`;
      document.documentElement.appendChild(host);
      state.overlayHost = host;
    }
    const shadow = state.overlayHost.__cmShadow;
    shadow.querySelector(".card").dataset.kind = kind;
    shadow.querySelector("strong").textContent = title;
    shadow.querySelector("p").textContent = detail;
  }

  function teardown() {
    state.stopped = true;
    state.session = null;
    state.pendingAction = null;
    state.locked = true;
    state.stable = null;
    if (state.observer) state.observer.disconnect();
    state.observer = null;
    if (state.frameId) cancelAnimationFrame(state.frameId);
    state.frameId = 0;
    if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
    state.deadlineTimer = 0;
    clearOverlay();
  }

  function terminalStop(reason) {
    send({ type: "STOP_SESSION", reason });
    teardown();
  }

  function schedule() {
    if (!state.session || state.frameId) return;
    state.frameId = requestAnimationFrame(processFrame);
  }

  function reportDecision(decision, timings = {}) {
    const signature = `${decision.kind}:${decision.state}:${decision.actionType || ""}:${decision.reason || ""}`;
    if (signature === state.lastReportedSignature) return;
    state.lastReportedSignature = signature;
    send({
      type: "SESSION_EVENT",
      event: {
        type: "decision",
        state: decision.state,
        actionType: decision.actionType,
        reason: decision.reason,
        confidence: decision.confidence,
        adapterVersion: Adapter.VERSION,
        at: Date.now(),
        ...timings
      }
    });
  }

  function reportHandoff(reason, terminal = false, type = "HANDOFF", extra = {}) {
    const signature = `${type}:${reason}:${terminal}`;
    if (signature === state.lastHandoffSignature) return;
    state.lastHandoffSignature = signature;
    send({ type, reason, terminal, ...extra });
  }

  function rectSignature(element) {
    const rect = element.getBoundingClientRect();
    return [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value * 2) / 2).join(":");
  }

  function elementIsActionable(element) {
    if (!element?.isConnected || element.hidden || element.disabled) return false;
    if (element.getAttribute?.("aria-disabled") === "true" || element.closest?.("[inert]")) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || style.pointerEvents === "none") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
    const top = document.elementFromPoint(x, y);
    return Boolean(top && (top === element || element.contains(top) || top.contains(element)));
  }

  function candidateIsStable(decision, now) {
    const element = decision.candidate?._element;
    if (!elementIsActionable(element)) return false;
    const signature = `${decision.actionType}:${decision.targetKey}:${rectSignature(element)}`;
    if (!state.stable || state.stable.signature !== signature) {
      state.stable = { signature, since: now };
      schedule();
      return false;
    }
    if (now - state.stable.since < MIN_STABLE_MS) {
      schedule();
      return false;
    }
    return true;
  }

  function present(decision, kind) {
    const signature = `${kind}:${decision.actionType}:${decision.targetKey}:${decision.reason || ""}`;
    const candidate = decision.candidate?._element;
    const targetIsStillHighlighted = state.highlighted === candidate
      && candidate?.isConnected
      && candidate.classList.contains("cm-pilot-target");
    if (signature === state.lastPresentedSignature && (!candidate || targetIsStillHighlighted)) return;
    state.lastPresentedSignature = signature;
    clearHighlight();
    if (candidate?.isConnected) {
      state.highlighted = candidate;
      candidate.classList.add("cm-pilot-target");
      candidate.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
      if (kind === "assist") candidate.focus?.({ preventScroll: false });
    }
    const labels = {
      dry: "Dry Run · proposed action",
      assist: "Assist · your action needed",
      handoff: "Concert Master paused"
    };
    const detail = decision.reason || `${decision.actionType} → ${decision.candidate?.label || "target"}`;
    ensureOverlay(kind === "handoff" ? "handoff" : "active", labels[kind], detail);
  }

  function performAction(decision) {
    const element = decision.candidate._element;
    if (decision.actionType === Core.ACTIONS.SET_QUANTITY) {
      const optionIndex = Array.from(element.options).findIndex((option) => option.value === decision.option.value);
      if (optionIndex < 0) return false;
      element.selectedIndex = optionIndex;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    element.click();
    return true;
  }

  function actionPermissionGranted(decision) {
    const permission = Core.permissionForAction(decision.actionType);
    return Boolean(permission && state.session.permissions?.[permission]);
  }

  function beginPending(decision, actionId, decisionAt) {
    const pending = {
      actionId,
      actionType: decision.actionType,
      targetKey: decision.targetKey,
      areaKey: decision.actionType === Core.ACTIONS.SELECT_AREA ? decision.targetKey : undefined,
      dispatchedAt: Date.now(),
      dispatchedMonotonic: monotonicNow(),
      deadlineAt: Date.now() + POSTCONDITION_TIMEOUT_MS
    };
    state.pendingAction = pending;
    state.session.pendingAction = pending;
    state.session.executedActionIds = [...new Set([...(state.session.executedActionIds || []), actionId])];
    state.locked = true;
    send({
      type: "ACTION_DISPATCHED",
      pendingAction: pending,
      event: {
        type: "actionDispatched",
        state: decision.state,
        actionType: decision.actionType,
        decisionToDispatchMs: performance.now() - decisionAt,
        adapterVersion: Adapter.VERSION,
        at: Date.now()
      }
    });
    state.deadlineTimer = setTimeout(schedule, POSTCONDITION_TIMEOUT_MS + 20);
  }

  function handleInventoryFailure(snapshot) {
    const selectedAreaKey = state.pendingAction?.areaKey || state.session.selectedAreaKey;
    if (!snapshot.signals.inventoryFailure) {
      state.inventoryFailureKey = "";
      return false;
    }
    if (!selectedAreaKey) return false;
    if (state.inventoryFailureKey === selectedAreaKey) return true;
    state.inventoryFailureKey = selectedAreaKey;
    const attempted = new Set(state.session.attemptedAreaKeys || []);
    attempted.add(selectedAreaKey);
    state.session.attemptedAreaKeys = [...attempted];
    state.pendingAction = null;
    state.session.pendingAction = null;
    state.locked = true;
    send({ type: "INVENTORY_FAILURE", areaKey: selectedAreaKey });
    const capped = !state.session.allowAreaFallback || attempted.size >= state.session.inventoryAttemptCap;
    const reason = capped
      ? "Inventory failed and the approved recovery limit was reached."
      : "Inventory failed. Return to the area list and review the next approved preference.";
    present({ reason }, "handoff");
    reportHandoff(capped ? "inventoryRecoveryLimit" : "inventoryFailure");
    return true;
  }

  function processFrame(frameTime) {
    state.frameId = 0;
    if (!state.session || state.stopped) return;
    if (Date.now() >= state.session.expiresAt) return terminalStop("Session expired.");
    if (Adapter.VERSION !== state.session.adapterVersion) return terminalStop("Adapter version mismatch.");
    if (location.origin !== state.session.origin || !Core.allowedOrigin(location.href)) return terminalStop("Origin changed.");
    if (document.visibilityState !== "visible") {
      ensureOverlay("handoff", "Concert Master paused", "The armed tab is hidden. No action will run.");
      return;
    }

    const observationAt = performance.now();
    const snapshot = Adapter.collectSnapshot(document, location.href);
    const selectedBestModes = snapshot.seatModes.filter((mode) => {
      const label = Core.normalizedKey(mode.label);
      return mode.selected && (label === "電腦配位" || label === "best available");
    });
    if (selectedBestModes.length === 1 && !state.session.bestAvailableConfirmed) {
      state.session.bestAvailableConfirmed = true;
      send({ type: "BEST_AVAILABLE_CONFIRMED" });
    }
    if (handleInventoryFailure(snapshot)) return;
    const decision = Adapter.decide(snapshot, state.session.target, {
      attemptedAreaKeys: state.session.attemptedAreaKeys,
      allowAreaFallback: state.session.allowAreaFallback,
      bestAvailableConfirmed: state.session.bestAvailableConfirmed
        || state.pendingAction?.actionType === Core.ACTIONS.SELECT_SEAT_MODE,
      pendingAction: state.pendingAction
    });
    const decisionAt = performance.now();
    const timings = {
      mutationToObservationMs: Math.max(0, observationAt - state.lastMutationAt),
      observationToDecisionMs: Math.max(0, decisionAt - observationAt)
    };
    reportDecision(decision, timings);

    if (decision.kind === "stop") return terminalStop(decision.reason);

    if (state.pendingAction) {
      if (Adapter.postconditionMet(state.pendingAction, decision)) {
        const completed = state.pendingAction;
        state.pendingAction = null;
        state.session.pendingAction = null;
        state.locked = false;
        if (completed.actionType === Core.ACTIONS.SELECT_SEAT_MODE) state.session.bestAvailableConfirmed = true;
        if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
        state.deadlineTimer = 0;
        send({
          type: "POSTCONDITION_MET",
          actionId: completed.actionId,
          event: {
            type: "postcondition",
            state: decision.state,
            actionType: completed.actionType,
            outcome: "met",
            actionToPostconditionMs: monotonicNow() - completed.dispatchedMonotonic,
            adapterVersion: Adapter.VERSION,
            at: Date.now()
          }
        });
      } else if (Date.now() >= state.pendingAction.deadlineAt) {
        return terminalStop(`Postcondition timed out after ${state.pendingAction.actionType}.`);
      } else {
        return;
      }
    }

    if (decision.kind === "cart") {
      ensureOverlay("success", "Cart held", "Automation has ended. Complete checkout yourself.");
      send({ type: "CART_HELD" });
      return teardown();
    }
    if (decision.kind === "handoff") {
      if (decision.terminal) return terminalStop(decision.reason);
      state.locked = true;
      present(decision, "handoff");
      reportHandoff(decision.signal || decision.reason, decision.terminal);
      return;
    }
    if (decision.kind === "wait") {
      state.stable = null;
      ensureOverlay("active", "Concert Master armed", decision.reason);
      return;
    }

    if (state.session.mode === Core.MODES.DRY_RUN) return present(decision, "dry");
    if (state.session.mode === Core.MODES.ASSIST) return present(decision, "assist");
    if (state.session.mode !== Core.MODES.BOUNDED_AUTO || state.locked) return;
    if (decision.confidence < 0.98) return terminalStop("Classification confidence is below 0.98.");
    if (!actionPermissionGranted(decision)) {
      state.locked = true;
      const reason = `Permission for ${decision.actionType} was not granted.`;
      reportHandoff(reason);
      return present({ ...decision, reason }, "handoff");
    }
    const id = Core.actionId(state.pageGeneration, decision);
    if ((state.session.executedActionIds || []).includes(id)) return terminalStop("A duplicate action was prevented.");
    if (!candidateIsStable(decision, frameTime)) return;

    // Classification and element resolution are repeated immediately before dispatch.
    const freshSnapshot = Adapter.collectSnapshot(document, location.href);
    const freshDecision = Adapter.decide(freshSnapshot, state.session.target, {
      attemptedAreaKeys: state.session.attemptedAreaKeys,
      allowAreaFallback: state.session.allowAreaFallback,
      bestAvailableConfirmed: state.session.bestAvailableConfirmed
    });
    if (freshDecision.kind !== "action"
      || freshDecision.actionType !== decision.actionType
      || freshDecision.targetKey !== decision.targetKey
      || !elementIsActionable(freshDecision.candidate?._element)) {
      return terminalStop("The target changed during final revalidation.");
    }

    beginPending(freshDecision, id, decisionAt);
    if (!performAction(freshDecision)) terminalStop("The authorized action could not be dispatched.");
  }

  function startSession(session) {
    teardown();
    state.stopped = false;
    state.session = session;
    state.pendingAction = session.pendingAction || null;
    state.locked = Boolean(session.locked);
    state.lastMutationAt = performance.now();
    state.lastReportedSignature = "";
    state.lastPresentedSignature = "";
    state.lastHandoffSignature = "";
    state.inventoryFailureKey = "";
    state.observer = new MutationObserver(() => {
      state.lastMutationAt = performance.now();
      schedule();
    });
    state.observer.observe(document, { childList: true, subtree: true, attributes: true });
    ensureOverlay("active", "Concert Master armed", `${session.mode} · expires ${new Date(session.expiresAt).toLocaleTimeString()}`);
    schedule();
  }

  function preview(rawTarget, options = {}) {
    const validation = Core.sanitizeTarget(rawTarget);
    const snapshot = Adapter.collectSnapshot(document, location.href);
    const response = {
      ok: validation.ok && Core.allowedOrigin(location.href),
      errors: validation.errors,
      usesAreaPriorities: validation.value.areaPriorities.length > 0,
      snapshot: Adapter.safeSnapshot(snapshot),
      adapterVersion: Adapter.VERSION,
      pageGeneration: state.pageGeneration
    };
    if (!validation.ok) return response;
    const decision = Adapter.decide(snapshot, validation.value, {
      attemptedAreaKeys: options.attemptedAreaKeys || [],
      allowAreaFallback: options.allowAreaFallback !== false,
      bestAvailableConfirmed: options.bestAvailableConfirmed
    });
    response.decision = {
      kind: decision.kind,
      state: decision.state,
      confidence: decision.confidence,
      actionType: decision.actionType,
      targetKey: decision.targetKey,
      reason: decision.reason,
      signal: decision.signal,
      candidate: decision.candidate ? {
        key: decision.candidate.key,
        label: decision.candidate.label,
        priceTwd: decision.candidate.priceTwd
      } : undefined
    };
    if (snapshot.areas.length) {
      const areaPlan = Core.resolveAreaPlan(
        snapshot.areas,
        validation.value,
        options.attemptedAreaKeys || [],
        options.allowAreaFallback !== false
      );
      response.areaPlan = {
        status: areaPlan.status,
        reason: areaPlan.reason,
        preferenceIndex: areaPlan.preferenceIndex,
        outcomes: areaPlan.outcomes
      };
    }
    return response;
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "START_SESSION") {
      startSession(message.session);
      respond({ ok: true });
      return false;
    }
    if (message?.type === "STOP_RUNTIME") {
      teardown();
      respond({ ok: true });
      return false;
    }
    if (message?.type === "RESUME_SESSION") {
      if (state.session) {
        state.session = message.session || state.session;
        state.locked = false;
        state.session.locked = false;
        state.lastPresentedSignature = "";
        state.lastHandoffSignature = "";
        clearOverlay();
        schedule();
      }
      respond({ ok: Boolean(state.session) });
      return false;
    }
    if (message?.type === "SYNC_SESSION") {
      if (message.session) {
        state.session = message.session;
        state.pendingAction = message.session.pendingAction || state.pendingAction;
        state.locked = Boolean(message.session.locked);
        schedule();
      }
      respond({ ok: true });
      return false;
    }
    if (message?.type === "PREVIEW_TARGET") {
      respond(preview(message.target, message.options));
      return false;
    }
    return false;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule();
  });

  // Native form value changes do not produce DOM mutations. Reclassify after
  // user or adapter input so a static fixture can advance without app scripts.
  document.addEventListener("input", schedule, true);
  document.addEventListener("change", schedule, true);
  document.addEventListener("click", schedule, true);
  window.addEventListener("hashchange", schedule);

  send({ type: "CONTENT_READY", pageGeneration: state.pageGeneration })?.then?.((response) => {
    if (response?.session) startSession(response.session);
  }).catch?.(() => {});
})(globalThis);
