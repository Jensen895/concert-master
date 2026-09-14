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

test("runtime contains no tixCraft network or reload primitive", () => {
  const sources = [
    "src/content/content.js",
    "src/background/service-worker.js",
    "src/adapters/tixcraft-v1.js"
  ].map((file) => fs.readFileSync(path.join(extensionRoot, file), "utf8")).join("\n");
  assert.doesNotMatch(sources, /\bfetch\s*\(|XMLHttpRequest|\.reload\s*\(/u);
});
