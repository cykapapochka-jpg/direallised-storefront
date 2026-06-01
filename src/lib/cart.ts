import { products } from "../data/catalog";
import type { CartItem, CartLine } from "../types";

const CART_KEY = "direallised_cart";

export function getCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]") as CartItem[];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addToCart(productId: string, size: string) {
  const product = products.find((item) => item.id === productId);
  if (!product) return getCart();

  const cart = getCart();
  const key = `${productId}:${size}`;
  const existing = cart.find((item) => item.key === key);

  if (existing) existing.qty += 1;
  else cart.push({ key, id: productId, size, qty: 1 });

  saveCart(cart);
  return cart;
}

export function removeFromCart(key: string) {
  const cart = getCart().filter((item) => item.key !== key);
  saveCart(cart);
  return cart;
}

export function cartLines(cart = getCart()): CartLine[] {
  return cart
    .map((item) => {
      const product = products.find((entry) => entry.id === item.id);
      return product ? { ...item, product, total: product.price * item.qty } : null;
    })
    .filter((item): item is CartLine => Boolean(item));
}

export function cartTotal(cart = getCart()) {
  return cartLines(cart).reduce((sum, item) => sum + item.total, 0);
}

export function cartCount(cart = getCart()) {
  return cart
    .filter((item) => products.some((product) => product.id === item.id))
    .reduce((sum, item) => sum + item.qty, 0);
}
