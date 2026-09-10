"use strict";

importScripts("../shared/core.js");

const Core = globalThis.ConcertMasterCore;
const SESSION_KEY = "activeSession";
const TELEMETRY_KEY = "telemetry";
const SESSION_ALARM = "concert-master-session-expiry";
let updateChain = Promise.resolve();
let recordChain = Promise.resolve();
const SESSION_MESSAGE_TYPES = new Set([
  "SESSION_EVENT", "ACTION_DISPATCHED", "POSTCONDITION_MET", "BEST_AVAILABLE_CONFIRMED",
  "INVENTORY_FAILURE", "AREA_REVIEW_REQUIRED", "HANDOFF", "CART_HELD", "STOP_SESSION"
]);

async function getSession() {
  return (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] || null;
}

function updateSession(mutator) {
  updateChain = updateChain.catch(() => null).then(async () => {
    const session = await getSession();
    if (!session) return null;
    const next = await mutator(structuredClone(session));
    if (next) await chrome.storage.session.set({ [SESSION_KEY]: next });
    return next;
  });
  return updateChain;
}

function record(event) {
  recordChain = recordChain.catch(() => null).then(async () => {
    const clean = Core.redactEvent({ ...event, at: event.at || Date.now() });
    const stored = await chrome.storage.local.get(TELEMETRY_KEY);
    const telemetry = Array.isArray(stored[TELEMETRY_KEY]) ? stored[TELEMETRY_KEY] : [];
    telemetry.push(clean);
    await chrome.storage.local.set({ [TELEMETRY_KEY]: telemetry.slice(-200) });
  });
  return recordChain;
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon.svg"),
      title,
      message,
      priority: 2
    });
  } catch {
    // The in-page handoff remains visible if OS notifications are unavailable.
  }
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function stopSession(reason, options = {}) {
  const session = await getSession();
  await chrome.storage.session.remove(SESSION_KEY);
  await chrome.alarms.clear(SESSION_ALARM);
  if (session?.tabId != null && options.tellContent !== false) {
    await sendToTab(session.tabId, { type: "STOP_RUNTIME", reason });
  }
  await record({ type: "stop", reason, state: session?.status?.state, adapterVersion: session?.adapterVersion });
  if (options.notify) await notify("Concert Master stopped", reason);
  return session;
}

async function previewInTab(tab, target, options) {
  if (!tab?.id || tab.incognito || !Core.allowedOrigin(tab.url || "")) {
    return { ok: false, errors: ["Open a supported tixCraft page in the active tab."] };
  }
  const response = await sendToTab(tab.id, { type: "PREVIEW_TARGET", target, options });
  return response || { ok: false, errors: ["The tixCraft adapter is not available in this tab. Reload the page once."] };
}

function buildPermissions(raw, mode) {
  const bounded = mode === Core.MODES.BOUNDED_AUTO;
  return {
    openPerformances: bounded && raw?.openPerformances !== false,
    selectPerformance: bounded && raw?.selectPerformance !== false,
    selectSeatMode: bounded && raw?.selectSeatMode !== false,
    selectArea: bounded && raw?.selectArea !== false,
    setQuantity: bounded && raw?.setQuantity !== false,
    submitReservation: bounded && raw?.submitReservation === true
  };
}

function sameAreaAuthorization(left, right) {
  return Boolean(left && right)
    && left.adapterVersion === right.adapterVersion
    && left.pageGeneration === right.pageGeneration
    && left.areaKey === right.areaKey
    && Core.normalizeLabel(left.label) === Core.normalizeLabel(right.label)
    && left.priceTwd === right.priceTwd;
}

async function handleArm(request) {
  const tab = await activeTab();
  const validation = Core.sanitizeTarget(request.target);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  if (!tab?.id || tab.incognito || !Core.allowedOrigin(tab.url || "")) {
    return { ok: false, errors: ["The active tab must be an ordinary tixCraft tab."] };
  }
  if (![Core.MODES.DRY_RUN, Core.MODES.ASSIST, Core.MODES.BOUNDED_AUTO].includes(request.mode)) {
    return { ok: false, errors: ["Choose Dry Run, Assist, or Bounded Auto."] };
  }

  const preview = await previewInTab(tab, validation.value, {
    allowAreaFallback: request.allowAreaFallback !== false,
    bestAvailableConfirmed: false
  });
  if (!preview.ok || preview.adapterVersion !== Core.ADAPTER_VERSION) {
    return { ok: false, errors: preview.errors?.length ? preview.errors : ["Adapter validation failed."] };
  }
  const visibleEventLabels = preview.snapshot?.eventLabels?.length
    ? preview.snapshot.eventLabels
    : preview.snapshot?.eventLabel ? [preview.snapshot.eventLabel] : [];
  if (visibleEventLabels.length
    && !visibleEventLabels.some((label) => Core.normalizedKey(label) === Core.normalizedKey(validation.value.eventLabel))) {
    return { ok: false, errors: ["The visible event does not exactly match the configured event."] };
  }
  if (preview.decision?.kind === "stop"
    || (request.mode === Core.MODES.BOUNDED_AUTO && preview.decision?.kind === "handoff")
    || preview.decision?.confidence < 0.98) {
    return { ok: false, errors: [preview.decision?.reason || "The current layout is not safely actionable."] };
  }
  if (request.areaReviewConfirmed
    && !sameAreaAuthorization(request.reviewedAreaAuthorization, preview.areaAuthorization)) {
    return { ok: false, errors: ["The resolved area changed after review. Review the page again."] };
  }

  const old = await getSession();
  if (old?.tabId != null) await sendToTab(old.tabId, { type: "STOP_RUNTIME", reason: "A new session was armed." });

  const durationMinutes = Math.min(30, Math.max(1, Number(request.durationMinutes) || 10));
  const now = Date.now();
  const session = {
    id: crypto.randomUUID(),
    tabId: tab.id,
    windowId: tab.windowId,
    origin: new URL(tab.url).origin,
    mode: request.mode,
    adapterVersion: Core.ADAPTER_VERSION,
    target: validation.value,
    permissions: buildPermissions(request.permissions, request.mode),
    allowAreaFallback: request.allowAreaFallback !== false,
    inventoryAttemptCap: Math.min(3, Math.max(1, Number(request.inventoryAttemptCap) || 3)),
    attemptedAreaKeys: [],
    executedActionIds: [],
    pendingAction: null,
    selectedAreaKey: null,
    bestAvailableConfirmed: preview.snapshot?.seatModes?.filter((mode) => {
      const label = Core.normalizedKey(mode.label);
      return mode.selected && (label === "電腦配位" || label === "best available");
    }).length === 1,
    areaAuthorization: request.areaReviewConfirmed ? preview.areaAuthorization : null,
    locked: false,
    createdAt: now,
    expiresAt: now + durationMinutes * 60_000,
    status: { state: preview.decision?.state || Core.STATES.LOADING, reason: "Armed", updatedAt: now }
  };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  await chrome.alarms.create(SESSION_ALARM, { when: session.expiresAt });
  await record({ type: "armed", state: session.status.state, adapterVersion: session.adapterVersion });
  await sendToTab(tab.id, { type: "START_SESSION", session });
  return { ok: true, session, preview };
}

async function handleAreaAuthorization(request) {
  const session = await getSession();
  if (!session) return { ok: false, errors: ["No session is armed."] };
  const tab = await chrome.tabs.get(session.tabId).catch(() => null);
  const preview = await previewInTab(tab, session.target, {
    attemptedAreaKeys: session.attemptedAreaKeys,
    allowAreaFallback: session.allowAreaFallback,
    bestAvailableConfirmed: session.bestAvailableConfirmed
  });
  if (!preview.areaAuthorization
    || preview.areaPlan?.status !== "resolved"
    || preview.decision?.kind !== "action"
    || preview.decision?.actionType !== Core.ACTIONS.SELECT_AREA) {
    return { ok: false, errors: [preview.areaPlan?.reason || "No unique approved area can be authorized."] };
  }
  if (!request.confirmed) return { ok: false, errors: ["Confirm the resolved label and price before continuing."] };
  if (!sameAreaAuthorization(request.reviewedAreaAuthorization, preview.areaAuthorization)) {
    return { ok: false, errors: ["The resolved area changed after review. Review it again."] };
  }
  const next = await updateSession((current) => ({
    ...current,
    areaAuthorization: preview.areaAuthorization,
    locked: false,
    status: { state: Core.STATES.AREA, reason: "Area reviewed", updatedAt: Date.now() }
  }));
  await sendToTab(session.tabId, { type: "RESUME_SESSION", session: next });
  return { ok: true, session: next, preview };
}

async function handleResume() {
  const session = await getSession();
  if (!session) return { ok: false, errors: ["No session is armed."] };
  const tab = await chrome.tabs.get(session.tabId).catch(() => null);
  const preview = await previewInTab(tab, session.target, {
    attemptedAreaKeys: session.attemptedAreaKeys,
    allowAreaFallback: session.allowAreaFallback,
    bestAvailableConfirmed: session.bestAvailableConfirmed
  });
  if (!preview.ok || ["stop", "handoff"].includes(preview.decision?.kind)) {
    return { ok: false, errors: [preview.decision?.reason || "The protected or unknown state is still present."] };
  }
  if (preview.decision?.actionType === Core.ACTIONS.SELECT_AREA) {
    return { ok: false, needsAreaReview: true, preview, errors: ["Review and confirm the resolved area before resuming."] };
  }
  const next = await updateSession((current) => ({
    ...current,
    locked: false,
    status: { state: preview.decision?.state, reason: "Manually resumed", updatedAt: Date.now() }
  }));
  await sendToTab(session.tabId, { type: "RESUME_SESSION", session: next });
  return { ok: true, session: next, preview };
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
  const local = await chrome.storage.local.get("uiDefaults");
  if (!local.uiDefaults) {
    await chrome.storage.local.set({
      uiDefaults: { mode: Core.MODES.ASSIST, durationMinutes: 10, allowAreaFallback: true, inventoryAttemptCap: 3 }
    });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const session = await getSession();
  if (session && Date.now() >= session.expiresAt) await stopSession("Session expired.", { notify: true });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SESSION_ALARM) stopSession("Session expired.", { notify: true });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "stop-session") stopSession("Stopped with the emergency keyboard shortcut.", { notify: true });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await getSession();
  if (session?.tabId === tabId) await stopSession("The armed tab was closed.", { tellContent: false });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const session = await getSession();
  if (session?.tabId === tabId && new URL(changeInfo.url).origin !== session.origin) {
    await stopSession("The armed tab changed origin.", { tellContent: false, notify: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (message?.type === "GET_POPUP_STATE") {
      const [session, local, tab] = await Promise.all([
        getSession(), chrome.storage.local.get(["uiDefaults", TELEMETRY_KEY]), activeTab()
      ]);
      return { ok: true, session, defaults: local.uiDefaults, telemetry: local[TELEMETRY_KEY] || [], tab };
    }
    if (message?.type === "PREVIEW_REQUEST") {
      return previewInTab(await activeTab(), message.target, message.options);
    }
    if (message?.type === "ARM_REQUEST") return handleArm(message);
    if (message?.type === "AUTHORIZE_AREA") return handleAreaAuthorization(message);
    if (message?.type === "RESUME_REQUEST") return handleResume();
    if (message?.type === "STOP_REQUEST") {
      await stopSession(message.reason || "Stopped by user.");
      return { ok: true };
    }
    if (message?.type === "CONTENT_READY") {
      const session = await getSession();
      if (!session || sender.tab?.id !== session.tabId) return { ok: true, session: null };
      if (Date.now() >= session.expiresAt) {
        await stopSession("Session expired.", { tellContent: false, notify: true });
        return { ok: true, session: null };
      }
      return { ok: true, session };
    }
    if (SESSION_MESSAGE_TYPES.has(message?.type)) {
      const current = await getSession();
      if (!current || sender.tab?.id !== current.tabId || message.sessionId !== current.id) {
        return { ok: false, ignored: true };
      }
    }
    if (message?.type === "SESSION_EVENT") {
      await record(message.event || {});
      await updateSession((session) => {
        if (sender.tab?.id !== session.tabId) return session;
        session.status = {
          state: message.event?.state,
          reason: message.event?.reason || message.event?.actionType,
          updatedAt: Date.now()
        };
        return session;
      });
      return { ok: true };
    }
    if (message?.type === "ACTION_DISPATCHED") {
      await record(message.event || {});
      const next = await updateSession((session) => {
        if (sender.tab?.id !== session.tabId) return session;
        session.pendingAction = message.pendingAction;
        session.executedActionIds = [...new Set([...(session.executedActionIds || []), message.pendingAction.actionId])];
        if (message.pendingAction.areaKey) session.selectedAreaKey = message.pendingAction.areaKey;
        return session;
      });
      return { ok: Boolean(next) };
    }
    if (message?.type === "POSTCONDITION_MET") {
      await record(message.event || {});
      await updateSession((session) => {
        if (sender.tab?.id === session.tabId && session.pendingAction?.actionId === message.actionId) {
          if (session.pendingAction.actionType === Core.ACTIONS.SELECT_SEAT_MODE) session.bestAvailableConfirmed = true;
          session.pendingAction = null;
        }
        return session;
      });
      return { ok: true };
    }
    if (message?.type === "BEST_AVAILABLE_CONFIRMED") {
      await updateSession((session) => {
        if (sender.tab?.id === session.tabId) session.bestAvailableConfirmed = true;
        return session;
      });
      return { ok: true };
    }
    if (message?.type === "INVENTORY_FAILURE") {
      const next = await updateSession((session) => {
        if (sender.tab?.id !== session.tabId) return session;
        session.attemptedAreaKeys = [...new Set([...(session.attemptedAreaKeys || []), message.areaKey])];
        session.pendingAction = null;
        session.areaAuthorization = null;
        session.locked = true;
        session.status = { state: Core.STATES.HANDOFF, reason: "inventoryFailure", updatedAt: Date.now() };
        return session;
      });
      await record({ type: "inventoryFailure", reason: "explicitInventoryFailure", adapterVersion: next?.adapterVersion });
      return { ok: true };
    }
    if (message?.type === "AREA_REVIEW_REQUIRED") {
      await updateSession((session) => ({
        ...session,
        locked: true,
        status: { state: Core.STATES.HANDOFF, reason: "areaReviewRequired", updatedAt: Date.now() }
      }));
      await notify("Review section choice", "Open Concert Master to confirm the resolved section and price.");
      return { ok: true };
    }
    if (message?.type === "HANDOFF") {
      if (message.terminal) {
        await stopSession(message.reason || "Automation boundary reached.");
        await notify("Concert Master stopped", "This step is outside the automation boundary.");
        return { ok: true };
      }
      await updateSession((session) => ({
        ...session,
        locked: true,
        status: { state: Core.STATES.HANDOFF, reason: message.reason, updatedAt: Date.now() }
      }));
      await record({ type: "handoff", reason: message.reason, state: Core.STATES.HANDOFF, adapterVersion: Core.ADAPTER_VERSION });
      await notify("Concert Master needs you", message.reason || "Complete the current step manually.");
      return { ok: true };
    }
    if (message?.type === "CART_HELD") {
      await stopSession("Cart reservation detected.", { tellContent: false });
      await notify("Tickets held", "Automation ended. Complete checkout yourself.");
      return { ok: true };
    }
    if (message?.type === "STOP_SESSION") {
      await stopSession(message.reason || "Safety stop.", { tellContent: false, notify: true });
      return { ok: true };
    }
    return { ok: false, errors: ["Unknown message."] };
  })().then(respond).catch((error) => respond({ ok: false, errors: [error.message || "Unexpected extension error."] }));
  return true;
});
