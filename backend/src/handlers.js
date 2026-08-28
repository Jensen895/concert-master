import { readJSON, sendJSON } from "./http.js";

export function healthHandler(_request, response) {
  sendJSON(response, 200, {
    status: "ok",
    service: "concert-master-backend",
    version: "0.1.0"
  });
}

export async function captchaDetectionHandler(request, response) {
  await acknowledgeRequest(request, response, "captcha-detection");
}

export async function questionDetectionHandler(request, response) {
  await acknowledgeRequest(request, response, "question-detection");
}

export async function textInputPlanHandler(request, response) {
  await acknowledgeRequest(request, response, "text-input-planning");
}

async function acknowledgeRequest(request, response, capability) {
  try {
    await readJSON(request);
    sendJSON(response, 501, {
      error: {
        code: "NOT_IMPLEMENTED",
        message: `${capability} is scaffolded but has no provider implementation.`
      }
    });
  } catch {
    sendJSON(response, 400, {
      error: {
        code: "INVALID_JSON",
        message: "The request body must be valid JSON."
      }
    });
  }
}

