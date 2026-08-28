import { createServer } from "node:http";
import { app } from "./app.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "8787", 10);

const server = createServer(app);
server.listen(port, host, () => {
  console.log(`Concert Master backend listening at http://${host}:${port}`);
});

