import express from "express";
import type { Request, Response } from "express";
import { findPromo, readStore, updateStore } from "./store.js";

type NotifyOrder = (order: unknown) => Promise<void>;

const shouldPersistOrders = !process.env.GITHUB_TOKEN || process.env.PERSIST_ORDERS === "true";

export function createApi(notifyOrder: NotifyOrder) {
  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.use((_, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    next();
  });

  app.use((request, response, next) => {
    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/api/health", (_, response) => {
    response.json({ ok: true });
  });

  app.get("/api/catalog", async (_, response: Response) => {
    const store = await readStore();
    response.json(store.catalog);
  });

  app.get("/api/promocodes/:code", async (request: Request, response: Response) => {
    const store = await readStore();
    const code = String(request.params.code ?? "");
    const promo = findPromo(store.promocodes, code);

    if (!promo) {
      response.status(404).json({ ok: false, message: "ПРОМОКОД НЕ НАЙДЕН" });
      return;
    }

    response.json({ ok: true, promo });
  });

  app.post("/api/orders", async (request: Request, response: Response) => {
    const order = {
      id: `DR-${Date.now()}`,
      kind: "order",
      createdAt: new Date().toISOString(),
      ...request.body,
    };

    if (shouldPersistOrders) {
      await updateStore((store) => {
        store.orders.unshift(order);
        store.orders = store.orders.slice(0, 300);
      });
    }

    await notifyOrder(order);
    response.status(201).json({ ok: true, orderId: order.id });
  });

  app.post("/api/requests", async (request: Request, response: Response) => {
    const requestItem = {
      id: `RQ-${Date.now()}`,
      kind: "request",
      createdAt: new Date().toISOString(),
      ...request.body,
    };

    if (shouldPersistOrders) {
      await updateStore((store) => {
        store.orders.unshift(requestItem);
        store.orders = store.orders.slice(0, 300);
      });
    }

    await notifyOrder(requestItem);
    response.status(201).json({ ok: true, requestId: requestItem.id });
  });

  return app;
}
