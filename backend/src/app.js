import { route } from "./router.js";
import { sendJSON } from "./http.js";

export async function app(request, response) {
  try {
    await route(request, response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJSON(response, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred."
        }
      });
    } else {
      response.end();
    }
  }
}

