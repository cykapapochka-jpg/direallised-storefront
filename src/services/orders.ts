import type { CartLine, OrderFormData } from "../types";
import { apiUrl } from "./api";

export interface OrderPayload {
  items: CartLine[];
  total: number;
  discount: number;
  customer: OrderFormData;
}

export async function submitOrder(payload: OrderPayload) {
  const endpoint = (import.meta.env.VITE_ORDER_ENDPOINT as string | undefined) ?? apiUrl("/api/orders");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Order API request failed");
  }

  return { ok: true, mode: "api" as const };
}
