const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const demoRoot = path.join(__dirname, "..", "demo");
const read = (...parts) => fs.readFileSync(path.join(demoRoot, ...parts), "utf8");

const detail = read("activity", "detail", "CM_DEMO_2026", "index.html");
const performances = read("activity", "game", "CM_DEMO_2026", "index.html");
const areas = read("ticket", "area", "CM_DEMO_2026", "index.html");
const tickets = read("ticket", "ticket", "CM_DEMO_2026", "index.html");
const order = read("order", "confirm", "index.html");
const disclosure = read("assets", "tixcraft-demo.js");

test("demo exposes each adapter-backed purchase stage", () => {
  assert.match(detail, /data-event-detail/u);
  assert.match(detail, /id="gameList"/u);
  assert.match(detail, /data-action="buy" aria-expanded="false" aria-controls="gameList">立即訂購/u);
  assert.match(detail, /id="gameList" class="grid-view game-reveal" data-performance-list hidden/u);
  assert.match(detail, /href="\/ticket\/area\/CM_DEMO_2026\//u);
  assert.match(detail, /id="dateSearchGameList"/u);
  assert.equal((detail.match(/data-performance>/gu) || []).length, 4);
  assert.equal((detail.match(/>Find tickets<\/a>/gu) || []).length, 4);
  assert.match(performances, /id="gameList"/u);
  assert.match(performances, /href="\/ticket\/area\/CM_DEMO_2026\//u);
  assert.match(areas, /id="zone"/u);
  assert.match(areas, /href="\/ticket\/ticket\/CM_DEMO_2026\//u);
  assert.match(tickets, /id="ticketForm"/u);
  assert.match(tickets, /action="\/order\/confirm\/"/u);
  assert.match(order, /data-cart-held/u);
});

test("demo supplies multiple dates, price bands, and unavailable inventory", () => {
  const dates = [...performances.matchAll(/data-performance-date="(\d{4}-\d{2}-\d{2})"/gu)]
    .map((match) => match[1]);
  assert.deepEqual([...new Set(dates)], ["2026-12-18", "2026-12-19", "2026-12-20", "2026-12-21"]);

  const prices = [...areas.matchAll(/data-price="(\d+)"/gu)].map((match) => Number(match[1]));
  assert.deepEqual(prices, [6800, 5800, 4800, 3800, 2800, 2500]);
  assert.ok((areas.match(/已售完/gu) || []).length >= 2);
  assert.match(areas, /data-ineligible="true"/u);
});

test("demo behavior is limited to its local performance disclosure", () => {
  assert.match(detail, /<script src="\/assets\/tixcraft-demo\.js"><\/script>/u);
  assert.match(disclosure, /gameList\.hidden = false/u);
  assert.doesNotMatch(disclosure, /fetch\s*\(|XMLHttpRequest|\.reload\s*\(/u);
  for (const html of [performances, areas, tickets, order]) {
    assert.doesNotMatch(html, /<script\b/iu);
  }
});
