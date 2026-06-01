import { createApi } from "../server/api";
import { createTelegramNotifier } from "../server/notifier";

const app = createApi(createTelegramNotifier(process.env.TELEGRAM_BOT_TOKEN));

export default function handler(request: any, response: any) {
  return app(request, response);
}
