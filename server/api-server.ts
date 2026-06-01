import "dotenv/config";
import { createServer } from "node:http";
import { createApi } from "./api";
import { createTelegramNotifier } from "./notifier";

const apiPort = Number(process.env.API_PORT || 8787);
const app = createApi(createTelegramNotifier(process.env.TELEGRAM_BOT_TOKEN));
const server = createServer(app);

server.listen(apiPort, "127.0.0.1", () => {
  console.log(`Direallised API: http://127.0.0.1:${apiPort}`);
});

process.once("SIGINT", () => {
  server.close();
});

process.once("SIGTERM", () => {
  server.close();
});
