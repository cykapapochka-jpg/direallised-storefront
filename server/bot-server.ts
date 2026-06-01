import "dotenv/config";
import { createBot } from "./bot.js";
import { updateStore } from "./store.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required in .env for bot polling");
}

const envAdminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter(Boolean);

if (envAdminIds.length) {
  await updateStore((store) => {
    for (const id of envAdminIds) {
      if (!store.admins.telegramIds.includes(id)) store.admins.telegramIds.push(id);
    }
  });
}

const bot = createBot(token);

bot.telegram
  .deleteWebhook({ drop_pending_updates: false })
  .then(() => bot.launch())
  .then(() => {
    console.log("Direallised admin bot is running");
  })
  .catch((error) => {
    console.error("Direallised admin bot failed:", error);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
