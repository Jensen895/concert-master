import {
  captchaDetectionHandler,
  healthHandler,
  questionDetectionHandler,
  textInputPlanHandler
} from "./handlers.js";
import { sendJSON } from "./http.js";

const routes = new Map([
  ["GET /health", healthHandler],
  ["POST /v1/detections/captcha", captchaDetectionHandler],
  ["POST /v1/detections/question", questionDetectionHandler],
  ["POST /v1/automation/text-input", textInputPlanHandler]
]);

export async function route(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const key = `${request.method ?? "GET"} ${url.pathname}`;
  const handler = routes.get(key);

  if (!handler) {
    sendJSON(response, 404, {
      error: {
        code: "NOT_FOUND",
        message: "No route matches this request."
      }
    });
    return;
  }

  await handler(request, response);
}

