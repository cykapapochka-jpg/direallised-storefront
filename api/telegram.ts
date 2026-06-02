import { createBot } from "../server/bot.js";
import { readStore, updateStore } from "../server/store.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? createBot(token) : null;

async function ensureEnvAdmins() {
  const envAdminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Boolean);

  if (!envAdminIds.length) return;

  const currentStore = await readStore();
  const hasMissingAdmin = envAdminIds.some((id) => !currentStore.admins.telegramIds.includes(id));
  if (!hasMissingAdmin) return;

  await updateStore((store) => {
    for (const id of envAdminIds) {
      if (!store.admins.telegramIds.includes(id)) store.admins.telegramIds.push(id);
    }
  });
}

async function readBody(request: any) {
  if (request.body) return typeof request.body === "string" ? JSON.parse(request.body) : request.body;

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.status(200).json({ ok: true, mode: "telegram-webhook" });
    return;
  }

  if (!bot) {
    response.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" });
    return;
  }

  try {
    await ensureEnvAdmins();
    const update = await readBody(request);
    await bot.handleUpdate(update, response);
  } catch (error) {
    console.error("Telegram webhook failed:", error);
    if (!response.headersSent) response.status(200).json({ ok: false });
  }
}
