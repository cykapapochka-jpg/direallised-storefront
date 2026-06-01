import type { Product, ProductRequestFormData } from "../types";
import { apiUrl } from "./api";

export interface ProductRequestPayload {
  product: Product;
  customer: ProductRequestFormData;
}

export async function submitProductRequest(payload: ProductRequestPayload) {
  const endpoint = apiUrl("/api/requests");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Product request API request failed");
  }

  return { ok: true };
}
