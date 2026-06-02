import { access } from "node:fs/promises";
import path from "node:path";
import { Markup, Telegraf } from "telegraf";
import type { Context, Telegraf as TelegrafInstance } from "telegraf";
import { normalizeCode, normalizeUsername, readStore, savePublicFile, updateStore } from "./store.js";
import type { Product, ProductCategory, PromoCode, StoreData } from "./types.js";

type BotInstance = TelegrafInstance<Context>;

interface AdminSession {
  mode:
    | "add:fulfillment"
    | "add:title"
    | "add:price"
    | "add:desc"
    | "add:sizes"
    | "add:slots"
    | "add:photo"
    | "edit:title"
    | "edit:price"
    | "edit:desc"
    | "edit:sizes"
    | "edit:photo"
    | "promo:code"
    | "promo:type"
    | "promo:value"
    | "promo:edit-value"
    | "admin:add";
  productId?: string;
  promoCode?: string;
  slotIndex?: number;
  draft?: Partial<Product> & { slots?: number; promo?: Partial<PromoCode> };
}

const sessions = new Map<number, AdminSession>();
const rootDir = process.cwd();

function sessionKey(key: number) {
  return String(key);
}

async function readPersistedSession(key: number) {
  const store = await readStore();
  const session = store.botSessions?.[sessionKey(key)];
  if (!session || typeof session !== "object") return undefined;
  return session as AdminSession;
}

async function persistSession(key: number, session: AdminSession) {
  sessions.set(key, session);
  await updateStore((store) => {
    store.botSessions = { ...(store.botSessions ?? {}), [sessionKey(key)]: session };
  });
}

async function clearSession(key: number) {
  sessions.delete(key);
  const store = await readStore();
  if (!store.botSessions?.[sessionKey(key)]) return;

  await updateStore((store) => {
    const nextSessions = { ...store.botSessions };
    delete nextSessions[sessionKey(key)];
    store.botSessions = nextSessions;
  });
}

async function getSession(key: number) {
  const session = sessions.get(key) ?? (await readPersistedSession(key));
  if (session) sessions.set(key, session);
  return session;
}

function panel(title: string, body: string[] = []) {
  return [`<b>${title}</b>`, body.length ? `<blockquote>${body.filter(Boolean).join("\n")}</blockquote>` : ""].filter(Boolean).join("\n\n");
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Новая позиция", "product:add"), Markup.button.callback("🧾 Позиции", "products:list")],
    [Markup.button.callback("🏷 Промокоды", "promos:list"), Markup.button.callback("👑 Админы", "admins:list")],
    [Markup.button.callback("🔄 Обновить", "menu")],
  ]);
}

function backMenu(target = "flow:back", label = "⬅️ Назад") {
  return Markup.inlineKeyboard([[Markup.button.callback(label, target)]]);
}

function addTypeMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🛒 Обычная продажа", "product:add-type:stock")],
    [Markup.button.callback("📝 Под заказ / заявка", "product:add-type:preorder")],
    [Markup.button.callback("⬅️ Назад", "menu")],
  ]);
}

function productsMenu(products: Product[]) {
  const rows = products.map((product) => [Markup.button.callback(`🖤 ${product.title}`, `product:view:${product.id}`)]);
  rows.push([Markup.button.callback("➕ Новая позиция", "product:add"), Markup.button.callback("⬅️ Меню", "menu")]);
  return Markup.inlineKeyboard(rows);
}

function productMenu(product: Product) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("👁 Фото-слоты", `product:photos:${product.id}`), Markup.button.callback("🗑 Удалить", `product:delete:${product.id}`)],
    [Markup.button.callback("✏️ Название", `product:edit:title:${product.id}`), Markup.button.callback("💸 Цена", `product:edit:price:${product.id}`)],
    [Markup.button.callback("📝 Описание", `product:edit:desc:${product.id}`), Markup.button.callback("📐 Размеры", `product:edit:sizes:${product.id}`)],
    [Markup.button.callback(product.fulfillment === "preorder" ? "📦 Сделать обычной" : "📝 Сделать под заказ", `product:toggle-fulfillment:${product.id}`)],
    [Markup.button.callback("⬅️ Позиции", "products:list"), Markup.button.callback("🏠 Меню", "menu")],
  ]);
}

function slotsMenu(product: Product) {
  const rows = product.images.map((_, index) => [
    Markup.button.callback(`🖼 Слот ${index + 1}`, `slot:view:${product.id}:${index}`),
    Markup.button.callback("♻️ Заменить", `slot:replace:${product.id}:${index}`),
    Markup.button.callback("🗑", `slot:delete:${product.id}:${index}`),
  ]);
  rows.push([Markup.button.callback("➕ Новый слот", `slot:replace:${product.id}:${product.images.length}`)]);
  rows.push([Markup.button.callback("⬅️ К позиции", `product:view:${product.id}`)]);
  return Markup.inlineKeyboard(rows);
}

function promosMenu(promos: PromoCode[]) {
  const rows = promos.map((promo) => [
    Markup.button.callback(`${promo.active ? "🟢" : "⚪"} ${promo.code}`, `promo:view:${promo.code}`),
  ]);
  rows.push([Markup.button.callback("➕ Создать промокод", "promo:add"), Markup.button.callback("⬅️ Меню", "menu")]);
  return Markup.inlineKeyboard(rows);
}

function promoMenu(promo: PromoCode) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💸 Изменить скидку", `promo:edit:${promo.code}`), Markup.button.callback(promo.active ? "⏸ Выключить" : "▶️ Включить", `promo:toggle:${promo.code}`)],
    [Markup.button.callback("🗑 Удалить", `promo:delete:${promo.code}`)],
    [Markup.button.callback("⬅️ Промокоды", "promos:list")],
  ]);
}

function adminsMenu(store: StoreData) {
  const idRows = store.admins.telegramIds.map((id) => [
    Markup.button.callback(`🆔 ${id}`, `admin:remove:id:${id}`),
  ]);
  const usernameRows = store.admins.usernames.map((username) => [
    Markup.button.callback(`@${username}`, `admin:remove:user:${username}`),
  ]);
  return Markup.inlineKeyboard([
    ...idRows,
    ...usernameRows,
    [Markup.button.callback("➕ Добавить админа", "admin:add")],
    [Markup.button.callback("⬅️ Меню", "menu")],
  ]);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function messageText(ctx: Context) {
  const message = ctx.message as { text?: string } | undefined;
  return message?.text?.trim() ?? "";
}

function userKey(ctx: Context) {
  return ctx.from?.id ?? 0;
}

function productSummary(product: Product) {
  return panel("🖤 Позиция", [
    `Название: ${escapeHtml(product.title)}`,
    `ID: ${escapeHtml(product.id)}`,
    `Цена: ${money(product.price)}`,
    `Категория: ${escapeHtml(product.category)}`,
    `Тип: ${product.fulfillment === "preorder" ? "под заказ / заявка" : "обычная продажа"}`,
    `Размеры: ${escapeHtml(product.sizes.join(", "))}`,
    `Фото-слоты: ${product.images.length}`,
    "",
    escapeHtml(product.desc),
  ]);
}

function promoSummary(promo: PromoCode) {
  return panel("🏷 Промокод", [
    `Код: ${escapeHtml(promo.code)}`,
    `Тип: ${promo.type === "percent" ? "процент" : "фиксированная сумма"}`,
    `Скидка: ${promo.type === "percent" ? `${promo.value}%` : money(promo.value)}`,
    `Статус: ${promo.active ? "активен" : "выключен"}`,
  ]);
}

async function isAdmin(ctx: Context, store?: StoreData) {
  if (!ctx.from) return false;
  const data = store ?? (await readStore());
  const username = normalizeUsername(ctx.from.username ?? "");
  return data.admins.telegramIds.includes(ctx.from.id) || (username.length > 0 && data.admins.usernames.includes(username));
}

async function ensureAdmin(ctx: Context) {
  const store = await readStore();

  if (store.admins.telegramIds.length === 0 && ctx.from) {
    await updateStore((nextStore) => {
      nextStore.admins.telegramIds.push(ctx.from!.id);
      if (ctx.from?.username) nextStore.admins.usernames.push(normalizeUsername(ctx.from.username));
    });
    await ctx.reply(panel("👑 Первый админ назначен", ["Теперь этот Telegram управляет Direallised."]), {
      parse_mode: "HTML",
      ...mainMenu(),
    });
    return true;
  }

  if (await isAdmin(ctx, store)) return true;
  await ctx.reply("⛔ Нет доступа к админке.");
  return false;
}

function sanitizeId(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 42);
}

function parseSizes(input: string) {
  return input
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicPathToLocalFile(publicUrl: string) {
  const cleanUrl = publicUrl.split("?")[0];
  if (!cleanUrl.startsWith("/")) return null;
  return path.join(rootDir, "public", ...cleanUrl.split("/").filter(Boolean));
}

async function sendSlotPhoto(ctx: Context, product: Product, slotIndex: number) {
  const image = product.images[slotIndex];
  if (!image) {
    await ctx.reply("В этом слоте пока нет фото.", backMenu(`product:photos:${product.id}`));
    return;
  }

  const caption = panel(`🖼 ${product.title}`, [`Слот: ${slotIndex + 1}/${product.images.length}`, `Файл: ${escapeHtml(image)}`]);
  const localFile = publicPathToLocalFile(image);

  if (localFile) {
    try {
      await access(localFile);
      await ctx.replyWithPhoto({ source: localFile }, { caption, parse_mode: "HTML", ...backMenu(`product:photos:${product.id}`) });
      return;
    } catch {
      // Fall through to text if a file was deleted manually.
    }
  }

  await ctx.reply(caption, { parse_mode: "HTML", ...backMenu(`product:photos:${product.id}`) });
}

async function getPhotoUrl(ctx: Context) {
  if (!ctx.message || !("photo" in ctx.message)) return null;
  const photo = ctx.message.photo.at(-1);
  if (!photo) return null;
  const link = await ctx.telegram.getFileLink(photo.file_id);
  return link.href;
}

async function saveTelegramPhoto(ctx: Context, productId: string, slotIndex: number) {
  const url = await getPhotoUrl(ctx);
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) return null;

  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `${sanitizeId(productId)}-${slotIndex + 1}-${Date.now()}.jpg`;
  return savePublicFile(`public/uploads/${fileName}`, bytes);
}

async function showProducts(ctx: Context) {
  const store = await readStore();
  await ctx.reply(
    panel("🧾 Позиции", [
      store.catalog.products.length
        ? `В каталоге: ${store.catalog.products.length}`
        : "Пока нет позиций. Создай первую вещь через кнопку ниже.",
    ]),
    { parse_mode: "HTML", ...productsMenu(store.catalog.products) },
  );
}

async function askNextPhoto(ctx: Context, session: AdminSession, productId: string) {
  const slots = session.draft?.slots ?? 1;
  const slot = session.slotIndex ?? 0;
  session.mode = "add:photo";
  session.slotIndex = slot;
  session.productId = productId;
  await ctx.reply(panel("🖼 Фото-слот", [`Загрузи фото для слота ${slot + 1}/${slots}.`, "Отправь изображение прямо в чат."]), {
    parse_mode: "HTML",
    ...backMenu(),
  });
}

async function showAddTitlePrompt(ctx: Context, session: AdminSession) {
  await ctx.reply(
    panel("➕ Новая позиция", [
      "Шаг 1/5",
      `Тип: ${session.draft?.fulfillment === "preorder" ? "под заказ / заявка" : "обычная продажа"}`,
      "Напиши название товара.",
    ]),
    { parse_mode: "HTML", ...backMenu() },
  );
}

async function showAddPricePrompt(ctx: Context) {
  await ctx.reply(panel("💸 Цена", ["Шаг 2/5", "Напиши цену числом, например 12000."]), {
    parse_mode: "HTML",
    ...backMenu(),
  });
}

async function showAddDescPrompt(ctx: Context) {
  await ctx.reply(panel("📝 Описание", ["Шаг 3/5", "Напиши описание товара. Можно в несколько строк."]), {
    parse_mode: "HTML",
    ...backMenu(),
  });
}

async function showAddSizesPrompt(ctx: Context) {
  await ctx.reply(panel("📐 Размеры", ["Шаг 4/5", "Напиши размеры через запятую: ONE SIZE, M"]), {
    parse_mode: "HTML",
    ...backMenu(),
  });
}

async function showAddSlotsPrompt(ctx: Context) {
  await ctx.reply(panel("🖼 Фото-слоты", ["Шаг 5/5", "Сколько фото-слотов создать? Например: 5"]), {
    parse_mode: "HTML",
    ...backMenu(),
  });
}

export function createBot(token: string) {
  const bot = new Telegraf(token);

  bot.catch((error) => {
    console.error("Telegram bot handler error:", error);
  });

  bot.start(async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    await ctx.reply(panel("🕯 Direallised Admin", ["Каталог, фото, промокоды, админы и заказы синхронизируются с сайтом."]), {
      parse_mode: "HTML",
      ...mainMenu(),
    });
  });

  bot.command("menu", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    await clearSession(userKey(ctx));
    await ctx.reply(panel("🏠 Главное меню", ["Выбери раздел админки."]), { parse_mode: "HTML", ...mainMenu() });
  });

  bot.action("menu", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    await clearSession(userKey(ctx));
    await ctx.answerCbQuery();
    await ctx.reply(panel("🏠 Главное меню", ["Выбери раздел админки."]), { parse_mode: "HTML", ...mainMenu() });
  });

  bot.action("flow:back", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const key = userKey(ctx);
    const session = await getSession(key);
    await ctx.answerCbQuery();

    if (!session) {
      await ctx.reply(panel("🏠 Главное меню", ["Выбери раздел админки."]), { parse_mode: "HTML", ...mainMenu() });
      return;
    }

    if (session.mode === "add:fulfillment") {
      sessions.delete(key);
      await ctx.reply(panel("🏠 Главное меню", ["Выбери раздел админки."]), { parse_mode: "HTML", ...mainMenu() });
      return;
    }
    if (session.mode === "add:title") {
      session.mode = "add:fulfillment";
      await ctx.reply(panel("➕ Новая позиция", ["Сначала выбери тип позиции."]), { parse_mode: "HTML", ...addTypeMenu() });
      return;
    }
    if (session.mode === "add:price") {
      session.mode = "add:title";
      await showAddTitlePrompt(ctx, session);
      return;
    }
    if (session.mode === "add:desc") {
      session.mode = "add:price";
      await showAddPricePrompt(ctx);
      return;
    }
    if (session.mode === "add:sizes") {
      session.mode = "add:desc";
      await showAddDescPrompt(ctx);
      return;
    }
    if (session.mode === "add:slots") {
      session.mode = "add:sizes";
      await showAddSizesPrompt(ctx);
      return;
    }
    if (session.mode === "add:photo") {
      const currentSlot = session.slotIndex ?? 0;
      if (currentSlot > 0) {
        session.slotIndex = currentSlot - 1;
        await askNextPhoto(ctx, session, String(session.productId || session.draft?.id));
      } else {
        session.mode = "add:slots";
        await showAddSlotsPrompt(ctx);
      }
      return;
    }

    if (session.mode.startsWith("edit:") && session.productId) {
      sessions.delete(key);
      const store = await readStore();
      const product = store.catalog.products.find((item) => item.id === session.productId);
      await ctx.reply(product ? productSummary(product) : "Позиция не найдена.", {
        parse_mode: "HTML",
        ...(product ? productMenu(product) : mainMenu()),
      });
      return;
    }

    if (session.mode === "promo:code") {
      await clearSession(key);
      const store = await readStore();
      await ctx.reply(panel("🏷 Промокоды", [`Активных: ${store.promocodes.filter((promo) => promo.active).length}`, `Всего: ${store.promocodes.length}`]), {
        parse_mode: "HTML",
        ...promosMenu(store.promocodes),
      });
      return;
    }
    if (session.mode === "promo:type") {
      session.mode = "promo:code";
      await persistSession(key, session);
      await ctx.reply(panel("➕ Новый промокод", ["Напиши код, например DIRE10."]), { parse_mode: "HTML", ...backMenu() });
      return;
    }
    if (session.mode === "promo:value") {
      session.mode = "promo:type";
      await persistSession(key, session);
      await ctx.reply(panel("🏷 Тип скидки", ["Напиши percent для процента или fixed для суммы в рублях."]), {
        parse_mode: "HTML",
        ...backMenu(),
      });
      return;
    }
    if (session.mode === "promo:edit-value" && session.promoCode) {
      await clearSession(key);
      const store = await readStore();
      const promo = store.promocodes.find((item) => item.code === session.promoCode);
      await ctx.reply(promo ? promoSummary(promo) : "Промокод не найден.", {
        parse_mode: "HTML",
        ...(promo ? promoMenu(promo) : mainMenu()),
      });
      return;
    }

    if (session.mode === "admin:add") {
      sessions.delete(key);
      const store = await readStore();
      await ctx.reply(
        panel("👑 Админы", [
          `Telegram ID: ${store.admins.telegramIds.length}`,
          `Username: ${store.admins.usernames.length}`,
          "Нажми на админа, чтобы разжаловать.",
        ]),
        { parse_mode: "HTML", ...adminsMenu(store) },
      );
    }
  });

  bot.action("product:add", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    sessions.set(userKey(ctx), { mode: "add:fulfillment", draft: { category: "jeans", fulfillment: "stock", images: [] } });
    await ctx.answerCbQuery();
    await ctx.reply(panel("➕ Новая позиция", ["Сначала выбери тип позиции."]), {
      parse_mode: "HTML",
      ...addTypeMenu(),
    });
  });

  bot.action(/^product:add-type:(stock|preorder)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const session = sessions.get(userKey(ctx)) ?? { mode: "add:fulfillment" as const, draft: { category: "jeans", images: [] } };
    session.mode = "add:title";
    session.draft = { ...session.draft, fulfillment: ctx.match[1] as Product["fulfillment"] };
    sessions.set(userKey(ctx), session);
    await ctx.answerCbQuery(ctx.match[1] === "preorder" ? "Под заказ" : "Обычная продажа");
    await showAddTitlePrompt(ctx, session);
  });

  bot.action("products:list", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    sessions.delete(userKey(ctx));
    await ctx.answerCbQuery();
    await showProducts(ctx);
  });

  bot.action(/^product:view:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const store = await readStore();
    const product = store.catalog.products.find((item) => item.id === ctx.match[1]);
    await ctx.answerCbQuery();
    if (!product) {
      await ctx.reply("Позиция не найдена.");
      return;
    }
    await ctx.reply(productSummary(product), { parse_mode: "HTML", ...productMenu(product) });
  });

  bot.action(/^product:delete:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const productId = ctx.match[1];
    await updateStore((store) => {
      store.catalog.products = store.catalog.products.filter((product) => product.id !== productId);
    });
    await ctx.answerCbQuery("Удалено");
    await ctx.reply(panel("🗑 Позиция удалена", ["Каталог сайта обновлен."]), { parse_mode: "HTML", ...mainMenu() });
  });

  bot.action(/^product:toggle-fulfillment:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    let updated: Product | undefined;
    await updateStore((store) => {
      updated = store.catalog.products.find((product) => product.id === ctx.match[1]);
      if (updated) {
        updated.fulfillment = updated.fulfillment === "preorder" ? "stock" : "preorder";
      }
    });
    await ctx.answerCbQuery("Тип позиции обновлен");
    if (updated) {
      await ctx.reply(productSummary(updated), { parse_mode: "HTML", ...productMenu(updated) });
    }
  });

  bot.action(/^product:edit:(title|price|desc|sizes):(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const field = ctx.match[1] as "title" | "price" | "desc" | "sizes";
    const productId = ctx.match[2];
    sessions.set(userKey(ctx), { mode: `edit:${field}` as AdminSession["mode"], productId });
    await ctx.answerCbQuery();
    await ctx.reply(
      panel("✏️ Редактирование", [
        field === "title"
          ? "Напиши новое название."
          : field === "price"
            ? "Напиши новую цену числом."
            : field === "desc"
              ? "Напиши новое описание."
              : "Напиши размеры через запятую: ONE SIZE, M",
      ]),
      { parse_mode: "HTML", ...backMenu() },
    );
  });

  bot.action(/^product:photos:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const store = await readStore();
    const product = store.catalog.products.find((item) => item.id === ctx.match[1]);
    await ctx.answerCbQuery();
    if (!product) {
      await ctx.reply("Позиция не найдена.");
      return;
    }
    await ctx.reply(panel("🖼 Фото-слоты", [`${product.title}`, `Слотов: ${product.images.length}`]), {
      parse_mode: "HTML",
      ...slotsMenu(product),
    });
  });

  bot.action(/^slot:view:(.+):(\d+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const store = await readStore();
    const product = store.catalog.products.find((item) => item.id === ctx.match[1]);
    await ctx.answerCbQuery();
    if (!product) {
      await ctx.reply("Позиция не найдена.");
      return;
    }
    await sendSlotPhoto(ctx, product, Number(ctx.match[2]));
  });

  bot.action(/^slot:replace:(.+):(\d+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    sessions.set(userKey(ctx), { mode: "edit:photo", productId: ctx.match[1], slotIndex: Number(ctx.match[2]) });
    await ctx.answerCbQuery();
    await ctx.reply(panel("♻️ Замена фото", [`Отправь новое фото для слота ${Number(ctx.match[2]) + 1}.`]), {
      parse_mode: "HTML",
      ...backMenu(),
    });
  });

  bot.action(/^slot:delete:(.+):(\d+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const productId = ctx.match[1];
    const slotIndex = Number(ctx.match[2]);
    await updateStore((store) => {
      const product = store.catalog.products.find((item) => item.id === productId);
      if (!product) return;
      product.images.splice(slotIndex, 1);
    });
    await ctx.answerCbQuery("Слот удален");
    await ctx.reply(panel("🗑 Фото-слот удален", ["Сайт уже получает обновленный набор фото."]), { parse_mode: "HTML" });
  });

  bot.action("promos:list", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    await clearSession(userKey(ctx));
    const store = await readStore();
    await ctx.answerCbQuery();
    await ctx.reply(panel("🏷 Промокоды", [`Активных: ${store.promocodes.filter((promo) => promo.active).length}`, `Всего: ${store.promocodes.length}`]), {
      parse_mode: "HTML",
      ...promosMenu(store.promocodes),
    });
  });

  bot.action("promo:add", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    await persistSession(userKey(ctx), { mode: "promo:code", draft: { promo: { type: "percent", active: true } } });
    await ctx.answerCbQuery();
    await ctx.reply(panel("➕ Новый промокод", ["Напиши код, например DIRE10."]), { parse_mode: "HTML", ...backMenu() });
  });

  bot.action(/^promo:view:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const store = await readStore();
    const promo = store.promocodes.find((item) => item.code === ctx.match[1]);
    await ctx.answerCbQuery();
    if (!promo) {
      await ctx.reply("Промокод не найден.");
      return;
    }
    await ctx.reply(promoSummary(promo), { parse_mode: "HTML", ...promoMenu(promo) });
  });

  bot.action(/^promo:toggle:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    let updated: PromoCode | undefined;
    await updateStore((store) => {
      updated = store.promocodes.find((item) => item.code === ctx.match[1]);
      if (updated) updated.active = !updated.active;
    });
    await ctx.answerCbQuery(updated?.active ? "Включен" : "Выключен");
    if (updated) await ctx.reply(promoSummary(updated), { parse_mode: "HTML", ...promoMenu(updated) });
  });

  bot.action(/^promo:delete:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const code = ctx.match[1];
    await updateStore((store) => {
      store.promocodes = store.promocodes.filter((promo) => promo.code !== code);
    });
    await ctx.answerCbQuery("Удален");
    await ctx.reply(panel("🗑 Промокод удален", [`${escapeHtml(code)} больше не применяется на сайте.`]), {
      parse_mode: "HTML",
      ...mainMenu(),
    });
  });

  bot.action(/^promo:edit:(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    await persistSession(userKey(ctx), { mode: "promo:edit-value", promoCode: ctx.match[1] });
    await ctx.answerCbQuery();
    await ctx.reply(panel("💸 Новая скидка", ["Напиши новое значение числом. Тип скидки останется прежним."]), {
      parse_mode: "HTML",
      ...backMenu(),
    });
  });

  bot.action("admins:list", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    sessions.delete(userKey(ctx));
    const store = await readStore();
    await ctx.answerCbQuery();
    await ctx.reply(
      panel("👑 Админы", [
        `Telegram ID: ${store.admins.telegramIds.length}`,
        `Username: ${store.admins.usernames.length}`,
        "Нажми на админа, чтобы разжаловать.",
      ]),
      { parse_mode: "HTML", ...adminsMenu(store) },
    );
  });

  bot.action("admin:add", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    sessions.set(userKey(ctx), { mode: "admin:add" });
    await ctx.answerCbQuery();
    await ctx.reply(panel("➕ Новый админ", ["Пришли Telegram ID или @username."]), { parse_mode: "HTML", ...backMenu() });
  });

  bot.action(/^admin:remove:(id|user):(.+)$/, async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const kind = ctx.match[1];
    const value = ctx.match[2];
    await updateStore((store) => {
      if (kind === "id") {
        const id = Number(value);
        if (store.admins.telegramIds.length > 1) {
          store.admins.telegramIds = store.admins.telegramIds.filter((item) => item !== id);
        }
      } else {
        store.admins.usernames = store.admins.usernames.filter((username) => username !== normalizeUsername(value));
      }
    });
    await ctx.answerCbQuery("Готово");
    const store = await readStore();
    await ctx.reply(panel("👑 Админы обновлены", ["Права доступа изменены."]), { parse_mode: "HTML", ...adminsMenu(store) });
  });

  bot.on("photo", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const session = sessions.get(userKey(ctx));
    if (!session || (session.mode !== "add:photo" && session.mode !== "edit:photo") || !session.productId) {
      await ctx.reply("🖼 Фото получено, но активного фото-слота нет. Открой /menu.");
      return;
    }

    const slotIndex = session.slotIndex ?? 0;
    const imageUrl = await saveTelegramPhoto(ctx, session.productId, slotIndex);
    if (!imageUrl) {
      await ctx.reply("Не смог сохранить фото. Попробуй отправить его еще раз.");
      return;
    }

    if (session.mode === "edit:photo") {
      await updateStore((store) => {
        const product = store.catalog.products.find((item) => item.id === session.productId);
        if (!product) return;
        product.images[slotIndex] = imageUrl;
        product.images = product.images.filter(Boolean);
      });
      sessions.delete(userKey(ctx));
      await ctx.reply(panel("✅ Фото обновлено", [`Слот ${slotIndex + 1} синхронизирован с сайтом.`]), {
        parse_mode: "HTML",
        ...mainMenu(),
      });
      return;
    }

    const images = session.draft?.images ?? [];
    images[slotIndex] = imageUrl;
    session.draft = { ...session.draft, images };

    const slots = session.draft.slots ?? 1;
    if (slotIndex + 1 < slots) {
      session.slotIndex = slotIndex + 1;
      await askNextPhoto(ctx, session, session.productId);
      return;
    }

    const draft = session.draft;
    const product: Product = {
      id: sanitizeId(draft?.id || draft?.title || `drop-${Date.now()}`),
      title: draft?.title || "Untitled",
      price: Number(draft?.price || 0),
      category: (draft?.category || "jeans") as ProductCategory,
      fulfillment: draft?.fulfillment || "stock",
      sizes: draft?.sizes?.length ? draft.sizes : ["ONE SIZE"],
      images: images.filter(Boolean),
      desc: draft?.desc || "",
    };

    await updateStore((store) => {
      store.catalog.products.unshift(product);
    });
    sessions.delete(userKey(ctx));
    await ctx.reply(panel("✅ Позиция добавлена", [`${escapeHtml(product.title)}`, "Каталог сайта уже обновлен."]), {
      parse_mode: "HTML",
      ...productMenu(product),
    });
  });

  bot.on("text", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const id = userKey(ctx);
    const session = await getSession(id);
    const text = messageText(ctx);
    if (!session) {
      await ctx.reply(panel("🏠 Главное меню", ["Выбери раздел админки."]), { parse_mode: "HTML", ...mainMenu() });
      return;
    }

    if (session.mode.startsWith("add:")) {
      const draft = session.draft ?? { category: "jeans", images: [] };
      if (session.mode === "add:title") {
        const productId = sanitizeId(text) || `drop-${Date.now()}`;
        session.draft = { ...draft, id: productId, title: text };
        session.mode = "add:price";
        await showAddPricePrompt(ctx);
        return;
      }
      if (session.mode === "add:price") {
        session.draft = { ...draft, price: Number(text.replace(/\D/g, "")) };
        session.mode = "add:desc";
        await showAddDescPrompt(ctx);
        return;
      }
      if (session.mode === "add:desc") {
        session.draft = { ...draft, desc: text };
        session.mode = "add:sizes";
        await showAddSizesPrompt(ctx);
        return;
      }
      if (session.mode === "add:sizes") {
        session.draft = { ...draft, sizes: parseSizes(text) };
        session.mode = "add:slots";
        await showAddSlotsPrompt(ctx);
        return;
      }
      if (session.mode === "add:slots") {
        const slots = Math.max(1, Math.min(12, Number(text.replace(/\D/g, "")) || 1));
        session.draft = { ...draft, slots };
        await askNextPhoto(ctx, session, String(draft.id));
        return;
      }
    }

    if (session.mode.startsWith("edit:") && session.productId) {
      let updated: Product | undefined;
      await updateStore((store) => {
        const product = store.catalog.products.find((item) => item.id === session.productId);
        if (!product) return;
        if (session.mode === "edit:title") product.title = text;
        if (session.mode === "edit:price") product.price = Number(text.replace(/\D/g, ""));
        if (session.mode === "edit:desc") product.desc = text;
        if (session.mode === "edit:sizes") product.sizes = parseSizes(text);
        updated = product;
      });
      sessions.delete(id);
      await ctx.reply(updated ? productSummary(updated) : "Позиция не найдена.", {
        parse_mode: "HTML",
        ...(updated ? productMenu(updated) : mainMenu()),
      });
      return;
    }

    if (session.mode === "promo:code") {
      session.draft = { ...session.draft, promo: { code: normalizeCode(text), type: "percent", active: true } };
      session.mode = "promo:type";
      await persistSession(id, session);
      await ctx.reply(panel("🏷 Тип скидки", ["Напиши percent для процента или fixed для суммы в рублях."]), {
        parse_mode: "HTML",
        ...backMenu(),
      });
      return;
    }
    if (session.mode === "promo:type") {
      const type = text.toLowerCase().includes("fixed") ? "fixed" : "percent";
      session.draft = { ...session.draft, promo: { ...session.draft?.promo, type, active: true } };
      session.mode = "promo:value";
      await persistSession(id, session);
      await ctx.reply(panel("💸 Размер скидки", [type === "percent" ? "Процент скидки числом." : "Сумма скидки в рублях."]), {
        parse_mode: "HTML",
        ...backMenu(),
      });
      return;
    }
    if (session.mode === "promo:value") {
      const promo = {
        code: normalizeCode(session.draft?.promo?.code || ""),
        type: session.draft?.promo?.type || "percent",
        value: Number(text.replace(/\D/g, "")),
        active: true,
      } satisfies PromoCode;
      await updateStore((store) => {
        store.promocodes = store.promocodes.filter((item) => item.code !== promo.code);
        store.promocodes.unshift(promo);
      });
      await clearSession(id);
      await ctx.reply(promoSummary(promo), { parse_mode: "HTML", ...promoMenu(promo) });
      return;
    }
    if (session.mode === "promo:edit-value" && session.promoCode) {
      let updated: PromoCode | undefined;
      await updateStore((store) => {
        updated = store.promocodes.find((promo) => promo.code === session.promoCode);
        if (updated) updated.value = Number(text.replace(/\D/g, ""));
      });
      await clearSession(id);
      await ctx.reply(updated ? promoSummary(updated) : "Промокод не найден.", {
        parse_mode: "HTML",
        ...(updated ? promoMenu(updated) : mainMenu()),
      });
      return;
    }

    if (session.mode === "admin:add") {
      await updateStore((store) => {
        if (text.startsWith("@")) {
          const username = normalizeUsername(text);
          if (username && !store.admins.usernames.includes(username)) store.admins.usernames.push(username);
        } else {
          const telegramId = Number(text.replace(/\D/g, ""));
          if (telegramId && !store.admins.telegramIds.includes(telegramId)) store.admins.telegramIds.push(telegramId);
        }
      });
      sessions.delete(id);
      const store = await readStore();
      await ctx.reply(panel("✅ Админ добавлен", ["Права доступа обновлены."]), { parse_mode: "HTML", ...adminsMenu(store) });
    }
  });

  return bot;
}

export async function notifyAdmins(bot: BotInstance, order: unknown) {
  const store = await readStore();
  const data = order as {
    id?: string;
    kind?: "order" | "request";
    total?: number;
    discount?: number;
    customer?: Record<string, string>;
    product?: Product;
    items?: Array<{ product?: Product; size?: string; qty?: number; total?: number }>;
  };
  const items = data.items
    ?.map((item) => `• ${escapeHtml(item.product?.title)} / ${escapeHtml(item.size)} × ${item.qty} — ${money(item.total)}`)
    .join("\n");
  const customer = data.customer ?? {};

  const text =
    data.kind === "request"
      ? panel("📝 Новая заявка", [
          `Номер: ${escapeHtml(data.id)}`,
          `Позиция: ${escapeHtml(data.product?.title)}`,
          `Цена на сайте: ${money(data.product?.price)}`,
          "",
          "Контактные данные",
          `Telegram: ${escapeHtml(customer.telegram)}`,
          customer.comment ? `Комментарий: ${escapeHtml(customer.comment)}` : "Комментарий: —",
        ])
      : panel("🛒 Новый заказ", [
    `Номер: ${escapeHtml(data.id)}`,
    "",
    items || "Без позиций",
    "",
    `Итого: ${money(data.total)}`,
    data.discount ? `Скидка: ${money(data.discount)}` : "",
    "",
    "Контактные данные",
    `Имя: ${escapeHtml(customer.name)}`,
    `Связь: ${escapeHtml(customer.contact)}`,
    `Телефон: ${escapeHtml(customer.phone)}`,
    `Город: ${escapeHtml(customer.city)}`,
    `Адрес: ${escapeHtml(customer.address)}`,
    customer.comment ? `Комментарий: ${escapeHtml(customer.comment)}` : "",
  ]);

  await Promise.allSettled(store.admins.telegramIds.map((id) => bot.telegram.sendMessage(id, text, { parse_mode: "HTML" })));
}
