import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { app } from "../src/app.js";

async function withServer(run) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("health endpoint reports service status", async () => {
  await withServer(async (baseURL) => {
    const response = await fetch(`${baseURL}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "concert-master-backend",
      version: "0.1.0"
    });
  });
});

test("feature endpoints expose deliberate placeholders", async () => {
  await withServer(async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/detections/captcha`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frame: { frameID: "placeholder" } })
    });
    const body = await response.json();

    assert.equal(response.status, 501);
    assert.equal(body.error.code, "NOT_IMPLEMENTED");
  });
});

