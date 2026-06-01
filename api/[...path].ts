import { createApi } from "../server/api.js";
import { createTelegramNotifier } from "../server/notifier.js";

const app = createApi(createTelegramNotifier(process.env.TELEGRAM_BOT_TOKEN));

export default function handler(request: any, response: any) {
  return app(request, response);
}
