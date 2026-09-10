(function initializePopup(root) {
  "use strict";

  const Core = root.ConcertMasterCore;
  const elements = Object.fromEntries([
    "statusPill", "sessionBanner", "sessionState", "sessionTimer", "modeNote", "siteBadge",
    "showDate", "quantity", "maximumPrice", "areaList", "addArea",
    "allowFallback", "ticketTypes", "submitReservation", "duration", "reviewPanel", "reviewState",
    "reviewBody", "confirmAreaRow", "confirmArea", "errorBox", "reviewButton", "armButton",
    "authorizeButton", "resumeButton", "stopButton", "areaRowTemplate"
  ].map((id) => [id, document.getElementById(id)]));

  const ui = {
    mode: Core.MODES.ASSIST,
    session: null,
    preview: null,
    reviewFingerprint: "",
    timer: 0
  };

  const modeNotes = {
    [Core.MODES.OFF]: "Stops the session and removes all page observation.",
    [Core.MODES.DRY_RUN]: "Classifies and shows the proposed action without changing the page.",
    [Core.MODES.ASSIST]: "Highlights and focuses the exact target. You activate it.",
    [Core.MODES.BOUNDED_AUTO]: "Runs one permitted action per confirmed state, then checks its postcondition."
  };

  function message(payload) {
    return chrome.runtime.sendMessage(payload);
  }

  function showError(errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    elements.errorBox.textContent = list.filter(Boolean).join(" ");
    elements.errorBox.classList.toggle("hidden", !elements.errorBox.textContent);
  }

  function formatPrice(value) {
    return Number.isFinite(value) ? `NT$${value.toLocaleString("en-US")}` : "Price unavailable";
  }

  function parsePriceInput(value) {
    const normalized = String(value || "").replaceAll(",", "").trim();
    return normalized ? Number(normalized) : undefined;
  }

  function addAreaRow(area = {}) {
    const row = elements.areaRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector("[data-field='displayLabel']").value = area.displayLabel || "";
    row.querySelector("[data-field='namePattern']").value = area.namePattern || area.displayLabel || "";
    row.querySelector("[data-field='maximumUnitPriceTwd']").value = area.maximumUnitPriceTwd || "";
    row.addEventListener("input", invalidateReview);
    row.addEventListener("click", (event) => {
      const action = event.target.dataset.action;
      if (!action) return;
      if (action === "remove" && elements.areaList.children.length > 1) row.remove();
      if (action === "up" && row.previousElementSibling) elements.areaList.insertBefore(row, row.previousElementSibling);
      if (action === "down" && row.nextElementSibling) elements.areaList.insertBefore(row.nextElementSibling, row);
      renumberAreas();
      invalidateReview();
    });
    elements.areaList.appendChild(row);
    renumberAreas();
  }

  function renumberAreas() {
    [...elements.areaList.children].forEach((row, index) => {
      row.querySelector(".rank").textContent = String(index + 1).padStart(2, "0");
    });
  }

  function readTarget() {
    return {
      showDate: elements.showDate.value,
      quantity: Number(elements.quantity.value),
      seatMode: "bestAvailable",
      areaPriorities: [...elements.areaList.children].map((row) => ({
        displayLabel: row.querySelector("[data-field='displayLabel']").value,
        namePattern: row.querySelector("[data-field='namePattern']").value,
        maximumUnitPriceTwd: parsePriceInput(row.querySelector("[data-field='maximumUnitPriceTwd']").value)
      })),
      ticketTypePriorities: elements.ticketTypes.value.split(",").map((value) => value.trim()).filter(Boolean),
      maximumUnitPriceTwd: parsePriceInput(elements.maximumPrice.value)
    };
  }

  function options() {
    return {
      allowAreaFallback: elements.allowFallback.checked,
      inventoryAttemptCap: 3
    };
  }

  function draftFingerprint() {
    return JSON.stringify({ target: readTarget(), options: options() });
  }

  function invalidateReview() {
    ui.preview = null;
    ui.reviewFingerprint = "";
    elements.reviewPanel.classList.add("hidden");
    elements.confirmArea.checked = false;
    updateButtons();
    saveDraft();
  }

  function saveDraft() {
    chrome.storage.local.set({
      draft: readTarget(),
      uiDefaults: {
        mode: ui.mode,
        durationMinutes: Number(elements.duration.value),
        allowAreaFallback: elements.allowFallback.checked,
        inventoryAttemptCap: 3
      }
    });
  }

  function populate(target = {}) {
    elements.showDate.value = Core.calendarDateKey(target.showDate || target.performanceLabel);
    elements.quantity.value = String(target.quantity || 2);
    elements.maximumPrice.value = target.maximumUnitPriceTwd || "";
    elements.ticketTypes.value = (target.ticketTypePriorities || []).join(", ");
    elements.areaList.replaceChildren();
    const areas = target.areaPriorities?.length ? target.areaPriorities : [{ displayLabel: "", namePattern: "" }];
    areas.forEach(addAreaRow);
  }

  function setMode(mode, stopIfOff = false) {
    ui.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.mode === mode);
    });
    elements.modeNote.textContent = modeNotes[mode];
    elements.submitReservation.closest(".toggle-row").classList.toggle("hidden", mode !== Core.MODES.BOUNDED_AUTO);
    if (mode !== Core.MODES.BOUNDED_AUTO) elements.submitReservation.checked = false;
    if (mode === Core.MODES.OFF && stopIfOff) stop();
    invalidateReview();
    updateButtons();
  }

  function renderSession() {
    const active = Boolean(ui.session);
    elements.sessionBanner.classList.toggle("hidden", !active);
    elements.stopButton.classList.toggle("hidden", !active);
    elements.armButton.classList.toggle("hidden", active || ui.mode === Core.MODES.OFF);
    elements.statusPill.className = `status-pill ${active ? (ui.session.locked ? "paused" : "active") : "off"}`;
    elements.statusPill.querySelector("span").textContent = active ? (ui.session.locked ? "Paused" : "Armed") : "Off";
    if (active) {
      elements.sessionState.textContent = ui.session.status?.reason || ui.session.status?.state || "Armed";
      elements.resumeButton.classList.toggle("hidden", !ui.session.locked);
      elements.reviewButton.textContent = ui.session.locked ? "Review current state" : "Review current page";
    } else {
      elements.resumeButton.classList.add("hidden");
      elements.authorizeButton.classList.add("hidden");
      elements.reviewButton.textContent = "Review current page";
    }
    document.querySelectorAll(".section input, .section select, .section button, [data-mode]").forEach((control) => {
      control.disabled = active;
    });
    elements.reviewButton.disabled = false;
    elements.confirmArea.disabled = false;
    tickTimer();
    updateButtons();
  }

  function tickTimer() {
    if (!ui.session) return;
    const remaining = Math.max(0, ui.session.expiresAt - Date.now());
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1_000);
    elements.sessionTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function reviewLine(label, value, tone = "") {
    const line = document.createElement("div");
    line.className = "review-line";
    const name = document.createElement("span");
    const result = document.createElement("b");
    name.textContent = label;
    result.textContent = value;
    result.className = tone;
    line.append(name, result);
    return line;
  }

  function renderReview(preview) {
    elements.reviewBody.replaceChildren();
    elements.reviewPanel.classList.remove("hidden");
    elements.reviewState.textContent = preview.decision?.state || preview.snapshot?.routeKind || "Unknown";
    elements.reviewBody.append(reviewLine("Adapter", preview.adapterVersion || "Unavailable", preview.ok ? "good" : "warn"));
    elements.reviewBody.append(reviewLine(
      "Event page",
      preview.snapshot?.eventId || "Not verified",
      preview.snapshot?.eventId ? "good" : "warn"
    ));
    if (preview.decision?.actionType) {
      elements.reviewBody.append(reviewLine("Proposed action", preview.decision.actionType, "good"));
    }
    if (preview.decision?.reason) {
      elements.reviewBody.append(reviewLine("Decision", preview.decision.reason, preview.decision.kind === "stop" ? "warn" : ""));
    }
    if (preview.areaPlan) {
      for (const outcome of preview.areaPlan.outcomes || []) {
        const value = outcome.resolvedLabel
          ? `${outcome.resolvedLabel} · ${formatPrice(outcome.priceTwd)} · ${outcome.status}`
          : outcome.status;
        elements.reviewBody.append(reviewLine(outcome.preference, value, outcome.status === "eligible" ? "good" : "warn"));
      }
    } else {
      elements.reviewBody.append(reviewLine(
        "Area verification",
        "Not on this page — Auto will pause before area selection",
        "warn"
      ));
    }
    if (preview.snapshot?.areas?.length && preview.areaPlan?.status !== "resolved") {
      for (const area of preview.snapshot.areas) {
        elements.reviewBody.append(reviewLine("Visible area", `${area.label} · ${formatPrice(area.priceTwd)}`, "warn"));
      }
    }
    if (preview.snapshot?.performances?.length && preview.decision?.kind === "stop") {
      for (const performance of preview.snapshot.performances) {
        elements.reviewBody.append(reviewLine("Visible performance", performance.label || performance.showDate, "warn"));
      }
    }
    const resolved = preview.areaPlan?.status === "resolved" && preview.areaAuthorization;
    elements.confirmAreaRow.classList.toggle("hidden", !resolved);
    elements.confirmArea.checked = false;
    elements.authorizeButton.classList.toggle("hidden", !(ui.session?.locked && resolved));
    if (ui.session?.locked && resolved) elements.resumeButton.classList.add("hidden");
    updateButtons();
  }

  function updateButtons() {
    const validation = Core.sanitizeTarget(readTarget());
    const reviewed = ui.reviewFingerprint === draftFingerprint();
    const areaNeedsConfirmation = Boolean(ui.preview?.areaAuthorization);
    const previewSafe = Boolean(ui.preview)
      && ui.preview.decision?.kind !== "stop"
      && !(ui.mode === Core.MODES.BOUNDED_AUTO && ui.preview.decision?.kind === "handoff")
      && ui.preview.decision?.confidence >= 0.98;
    elements.armButton.textContent = `Arm ${ui.mode === Core.MODES.BOUNDED_AUTO ? "Bounded Auto" : ui.mode === Core.MODES.DRY_RUN ? "Dry Run" : "Assist"}`;
    elements.armButton.disabled = !validation.ok || ui.mode === Core.MODES.OFF || !reviewed || !previewSafe
      || (areaNeedsConfirmation && !elements.confirmArea.checked);
    if (!ui.session) elements.reviewButton.disabled = !validation.ok || ui.mode === Core.MODES.OFF;
    elements.authorizeButton.disabled = areaNeedsConfirmation && !elements.confirmArea.checked;
  }

  async function review() {
    showError("");
    const target = ui.session?.target || readTarget();
    const response = await message({
      type: "PREVIEW_REQUEST",
      target,
      options: ui.session ? {
        attemptedAreaKeys: ui.session.attemptedAreaKeys,
        allowAreaFallback: ui.session.allowAreaFallback,
        bestAvailableConfirmed: ui.session.bestAvailableConfirmed
      } : options()
    });
    if (!response?.ok) {
      showError(response?.errors || "Unable to review this page.");
      return;
    }
    ui.preview = response;
    ui.reviewFingerprint = draftFingerprint();
    renderReview(response);
  }

  async function arm() {
    showError("");
    const validation = Core.sanitizeTarget(readTarget());
    if (!validation.ok) return showError(validation.errors);
    if (ui.reviewFingerprint !== draftFingerprint()) return showError("Review the current page after changing the target.");
    if (ui.preview?.areaAuthorization && !elements.confirmArea.checked) return showError("Confirm the resolved area and price.");
    elements.armButton.disabled = true;
    const response = await message({
      type: "ARM_REQUEST",
      mode: ui.mode,
      target: validation.value,
      reviewedEventId: ui.preview?.snapshot?.eventId,
      durationMinutes: Number(elements.duration.value),
      allowAreaFallback: elements.allowFallback.checked,
      inventoryAttemptCap: 3,
      areaReviewConfirmed: elements.confirmArea.checked,
      reviewedAreaAuthorization: ui.preview?.areaAuthorization,
      permissions: {
        openPerformances: true,
        selectPerformance: true,
        selectSeatMode: true,
        selectArea: true,
        setQuantity: true,
        submitReservation: elements.submitReservation.checked
      }
    });
    if (!response?.ok) {
      showError(response?.errors || "The session could not be armed.");
      return updateButtons();
    }
    ui.session = response.session;
    saveDraft();
    renderSession();
  }

  async function authorizeArea() {
    if (!elements.confirmArea.checked) return showError("Confirm the resolved section and price.");
    const response = await message({
      type: "AUTHORIZE_AREA",
      confirmed: true,
      reviewedAreaAuthorization: ui.preview?.areaAuthorization
    });
    if (!response?.ok) return showError(response?.errors || "The area could not be authorized.");
    ui.session = response.session;
    elements.authorizeButton.classList.add("hidden");
    renderSession();
  }

  async function resume() {
    const response = await message({ type: "RESUME_REQUEST" });
    if (!response?.ok) {
      if (response?.preview) {
        ui.preview = response.preview;
        renderReview(response.preview);
      }
      return showError(response?.errors || "The session cannot resume yet.");
    }
    ui.session = response.session;
    renderSession();
  }

  async function stop() {
    await message({ type: "STOP_REQUEST", reason: "Stopped by user." });
    ui.session = null;
    renderSession();
  }

  function wireEvents() {
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode, true));
    });
    elements.addArea.addEventListener("click", () => {
      if (elements.areaList.children.length < 12) addAreaRow();
      invalidateReview();
    });
    for (const input of document.querySelectorAll("input, select")) {
      if (!input.closest(".area-row") && input !== elements.confirmArea) input.addEventListener("input", invalidateReview);
    }
    elements.confirmArea.addEventListener("change", updateButtons);
    elements.reviewButton.addEventListener("click", review);
    elements.armButton.addEventListener("click", arm);
    elements.authorizeButton.addEventListener("click", authorizeArea);
    elements.resumeButton.addEventListener("click", resume);
    elements.stopButton.addEventListener("click", stop);
  }

  async function initialize() {
    const response = await message({ type: "GET_POPUP_STATE" });
    const defaults = response.defaults || {};
    ui.session = response.session || null;
    populate(ui.session?.target || (await chrome.storage.local.get("draft")).draft || {});
    elements.duration.value = String(defaults.durationMinutes || 10);
    elements.allowFallback.checked = defaults.allowAreaFallback !== false;
    elements.submitReservation.checked = Boolean(ui.session?.permissions?.submitReservation);
    setMode(ui.session?.mode || defaults.mode || Core.MODES.ASSIST);
    const identity = Core.tixcraftPageIdentity(response.tab?.url || "");
    const supported = Core.allowedOrigin(response.tab?.url || "")
      && Boolean(ui.session || (identity.routeKind === "detail" && identity.eventId));
    elements.siteBadge.textContent = supported ? "tixCraft ready" : "Open event detail";
    elements.siteBadge.className = `site-badge ${supported ? "ready" : "error"}`;
    renderSession();
    wireEvents();
    ui.timer = setInterval(tickTimer, 1_000);
    chrome.storage.onChanged.addListener(async (_changes, areaName) => {
      if (areaName !== "session") return;
      const latest = await message({ type: "GET_POPUP_STATE" });
      ui.session = latest.session || null;
      renderSession();
    });
  }

  initialize().catch((error) => showError(error.message));
})(globalThis);
