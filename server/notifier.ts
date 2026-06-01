import { Telegraf } from "telegraf";
import { notifyAdmins } from "./bot";

let notifyClient: Telegraf | null = null;

export function createTelegramNotifier(token?: string) {
  if (!token) {
    return async () => {};
  }

  notifyClient ??= new Telegraf(token);

  return async (payload: unknown) => {
    try {
      await notifyAdmins(notifyClient!, payload);
    } catch (error) {
      console.error("Telegram notification failed:", error);
    }
  };
}
