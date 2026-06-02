import { findPromo, readStore } from "../../server/store.js";

export default async function handler(request: any, response: any) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ ok: false, message: "METHOD_NOT_ALLOWED" });
    return;
  }

  const code = Array.isArray(request.query.code) ? request.query.code[0] : request.query.code;
  const store = await readStore();
  const promo = findPromo(store.promocodes, String(code ?? ""));

  if (!promo) {
    response.status(404).json({ ok: false, message: "PROMOCODE_NOT_FOUND" });
    return;
  }

  response.status(200).json({ ok: true, promo });
}
