const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionRoot = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));

test("manifest is a narrow MV3 extension", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.incognito, "not_allowed");
  assert.deepEqual(manifest.host_permissions, [
    "https://tixcraft.com/*",
    "https://www.tixcraft.com/*",
    "http://localhost/*"
  ]);
  for (const forbidden of ["cookies", "webRequest", "webRequestBlocking", "proxy", "scripting"]) {
    assert.equal(manifest.permissions.includes(forbidden), false, forbidden);
  }
});

test("the local demo origin is available to the content script", () => {
  assert.equal(manifest.content_scripts[0].matches.includes("http://localhost/*"), true);
});

test("content scripts load the core and adapter before the controller", () => {
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/shared/core.js",
    "src/adapters/tixcraft-v1.js",
    "src/content/content.js"
  ]);
  assert.equal(manifest.content_scripts[0].all_frames, false);
});

test("area priorities are optional and expose one exact-name input plus one global price limit", () => {
  const popup = fs.readFileSync(path.join(extensionRoot, "src/popup/popup.html"), "utf8");
  const template = popup.match(/<template id="areaRowTemplate">([\s\S]*?)<\/template>/u)?.[1] || "";
  assert.equal((template.match(/<input\b/gu) || []).length, 1);
  assert.match(template, /data-field="name"/u);
  assert.doesNotMatch(template, /\brequired\b/u);
  assert.doesNotMatch(template, /displayLabel|namePattern|maximumUnitPriceTwd/u);
  assert.match(popup, /Area priority <small>\(optional\)<\/small>/u);
  assert.match(popup, /first available area[^<]*maximum price/u);
  assert.match(popup, /id="maximumPrice"[^>]*required/u);
});

test("ticket requests expose separate full and discount checkboxes and quantities", () => {
  const popup = fs.readFileSync(path.join(extensionRoot, "src/popup/popup.html"), "utf8");
  assert.match(popup, /id="fullTicketEnabled"[^>]*type="checkbox"/u);
  assert.match(popup, /id="fullTicketQuantity"[^>]*type="number"/u);
  assert.match(popup, /id="discountTicketEnabled"[^>]*type="checkbox"/u);
  assert.match(popup, /id="discountTicketQuantity"[^>]*type="number"/u);
  assert.match(popup, /<strong>全票：<\/strong>/u);
  assert.match(popup, /<strong>優惠票：<\/strong>/u);
  assert.doesNotMatch(popup, /id="ticketTypes"/u);
});

test("bounded auto has no second area-confirmation gate", () => {
  const popup = fs.readFileSync(path.join(extensionRoot, "src/popup/popup.html"), "utf8");
  const controller = fs.readFileSync(path.join(extensionRoot, "src/content/content.js"), "utf8");
  const worker = fs.readFileSync(path.join(extensionRoot, "src/background/service-worker.js"), "utf8");
  assert.doesNotMatch(popup, /confirmArea|authorizeButton/u);
  assert.doesNotMatch(controller, /AREA_REVIEW_REQUIRED|areaAuthorization/u);
  assert.doesNotMatch(worker, /AREA_REVIEW_REQUIRED|AUTHORIZE_AREA|areaAuthorization/u);
});

test("runtime contains no tixCraft network or reload primitive", () => {
  const sources = [
    "src/content/content.js",
    "src/background/service-worker.js",
    "src/adapters/tixcraft-v1.js"
  ].map((file) => fs.readFileSync(path.join(extensionRoot, file), "utf8")).join("\n");
  assert.doesNotMatch(sources, /\bfetch\s*\(|XMLHttpRequest|\.reload\s*\(/u);
});

test("the in-page status card exposes the registered request and expands on click", () => {
  const controller = fs.readFileSync(path.join(extensionRoot, "src/content/content.js"), "utf8");
  assert.match(controller, /data-value="date"/u);
  assert.match(controller, /data-value="tickets"/u);
  assert.match(controller, /data-value="price"/u);
  assert.match(controller, /aria-expanded="false"/u);
  assert.match(controller, /card\.addEventListener\("click"/u);
});

test("arming closes the large popup after the session starts", () => {
  const popupController = fs.readFileSync(path.join(extensionRoot, "src/popup/popup.js"), "utf8");
  assert.match(popupController, /ui\.session = response\.session;[\s\S]*?window\.close\(\);/u);
});

test("sale watching has no expiry until the matching performance appears", () => {
  const controller = fs.readFileSync(path.join(extensionRoot, "src/content/content.js"), "utf8");
  const worker = fs.readFileSync(path.join(extensionRoot, "src/background/service-worker.js"), "utf8");
  assert.match(controller, /targetPerformanceAppeared/u);
  assert.match(controller, /WAIT_POLL_INTERVAL_MS/u);
  assert.match(worker, /expiresAt: timerStarted \?[^:]+: null/u);
  assert.match(worker, /PERFORMANCE_AVAILABLE/u);
});

test("review shows autocorrect and tixCraft login reminders", () => {
  const popupController = fs.readFileSync(path.join(extensionRoot, "src/popup/popup.js"), "utf8");
  const adapter = fs.readFileSync(path.join(extensionRoot, "src/adapters/tixcraft-v1.js"), "utf8");
  assert.match(popupController, /Keyboard assistance/u);
  assert.match(popupController, /tixCraft account/u);
  assert.doesNotMatch(popupController, /OS-wide|OPEN_AUTOCORRECT_SETTINGS|chrome:\/\/settings/u);
  assert.match(adapter, /accountStatus/u);
  const popup = fs.readFileSync(path.join(extensionRoot, "src/popup/popup.html"), "utf8");
  assert.match(popup, /data-field="name"[^>]*autocorrect="off"[^>]*spellcheck="false"/u);
});

test("armed text inputs disable autocorrect and every pending action uses waiting mode", () => {
  const controller = fs.readFileSync(path.join(extensionRoot, "src/content/content.js"), "utf8");
  assert.match(controller, /setAttribute\("autocorrect", "off"\)/u);
  assert.match(controller, /setAttribute\("spellcheck", "false"\)/u);
  assert.match(controller, /deadlineAt: null/u);
  assert.doesNotMatch(controller, /POSTCONDITION_TIMEOUT_MS/u);
});

test("verification and final submission remain manual", () => {
  const core = fs.readFileSync(path.join(extensionRoot, "src/shared/core.js"), "utf8");
  const adapter = fs.readFileSync(path.join(extensionRoot, "src/adapters/tixcraft-v1.js"), "utf8");
  const controller = fs.readFileSync(path.join(extensionRoot, "src/content/content.js"), "utf8");
  const popup = fs.readFileSync(path.join(extensionRoot, "src/popup/popup.html"), "utf8");
  assert.doesNotMatch(core, /SUBMIT_RESERVATION/u);
  assert.doesNotMatch(popup, /submitReservation/u);
  assert.match(adapter, /uniqueElements\(scope, \["#TicketForm_agree"\]\)/u);
  assert.match(adapter, /uniqueElements\(scope, \["#TicketForm_verifyCode"\]\)/u);
  assert.match(controller, /completedActionType === Core\.ACTIONS\.ACKNOWLEDGE_TERMS/u);
  assert.match(controller, /decision\.signal === "challenge"/u);
  assert.match(adapter, /Concert Master will not read or fill the code/u);
});
