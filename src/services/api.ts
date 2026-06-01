import { fallbackCatalog } from "../data/catalog";
import type { CatalogData, PromoCode } from "../types";

const configuredApiBase = import.meta.env.VITE_API_BASE as string | undefined;
const localApiBase =
  typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname) ? "http://127.0.0.1:8787" : "";
const API_BASE = configuredApiBase ?? localApiBase;

export async function fetchCatalog(): Promise<CatalogData> {
  try {
    const response = await fetch(`${API_BASE}/api/catalog`);
    if (!response.ok) throw new Error("Catalog request failed");
    return (await response.json()) as CatalogData;
  } catch (error) {
    console.warn("Catalog API is unavailable, using local fallback.", error);
    return fallbackCatalog;
  }
}

export async function fetchPromo(code: string): Promise<PromoCode | null> {
  const response = await fetch(`${API_BASE}/api/promocodes/${encodeURIComponent(code)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Promo request failed");
  const data = (await response.json()) as { promo: PromoCode };
  return data.promo;
}

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}
