import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { fallbackCatalog, productPhotos } from "./data/catalog";
import { addToCart, cartCount, cartLines, getCart, removeFromCart, saveCart } from "./lib/cart";
import { money } from "./lib/money";
import { fetchCatalog, fetchPromo } from "./services/api";
import { submitOrder } from "./services/orders";
import { submitProductRequest } from "./services/requests";
import type { CartItem, CartLine, CatalogData, CategoryId, OrderFormData, Product, ProductRequestFormData } from "./types";

type Route =
  | { page: "home" }
  | { page: "shop"; category: CategoryId }
  | { page: "product"; id: string }
  | { page: "cart" };

type SignalIconName = "archive" | "delivery" | "custom" | "handmade";

const signalItems: Array<{ icon: SignalIconName; label: string }> = [
  { icon: "archive", label: "archive clothing" },
  { icon: "delivery", label: "доставка по РФ" },
  { icon: "custom", label: "изделия под заказ" },
  { icon: "handmade", label: "ручная работа" },
];

function parseRoute(hash: string): Route {
  const cleanHash = (hash || "#/").split("?")[0];
  if (cleanHash === "#/" || cleanHash === "") return { page: "home" };
  if (cleanHash === "#/cart") return { page: "cart" };
  if (cleanHash.startsWith("#/product/")) return { page: "product", id: cleanHash.replace("#/product/", "") };
  if (cleanHash === "#/shop") return { page: "shop", category: "all" };
  if (cleanHash.startsWith("#/shop/")) {
    const category = cleanHash.replace("#/shop/", "") as CategoryId;
    return { page: "shop", category };
  }
  return { page: "home" };
}

function SignalIcon({ name }: { name: SignalIconName }) {
  if (name === "archive") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8.5h16v11H4z" />
        <path d="M6.2 8.5V5.7h5.2l1.5 2.8" />
        <path d="M8 13.5h8" />
      </svg>
    );
  }

  if (name === "delivery") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.8 7.5h11.5v9H3.8z" />
        <path d="M15.3 10h3.2l2.1 2.6v3.9h-5.3z" />
        <path d="M7.2 18.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z" />
        <path d="M17.8 18.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z" />
      </svg>
    );
  }

  if (name === "custom") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h8.2L20 11.8 11.8 20 5 13.2z" />
        <path d="M9 8.8h.1" />
        <path d="M14.6 4.2v3.2" />
        <path d="M18.1 6.1l-2.3 2.3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 18.8 18.8 6" />
      <path d="m15.8 4.8 2.4-2.4 1.9 1.9-2.4 2.4" />
      <path d="M5.3 19.5c2.4-1.3 4.3-1.1 5.5.6" />
      <path d="M6.7 13.7 10.3 17" />
    </svg>
  );
}

function SignalMarqueeGroup({ hidden = false }: { hidden?: boolean }) {
  return (
    <div className="signal-marquee-group" aria-hidden={hidden}>
      {signalItems.map((item) => (
        <span className="signal-item" key={`${item.icon}-${item.label}`}>
          <span className="signal-icon">
            <SignalIcon name={item.icon} />
          </span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [cart, setCart] = useState<CartItem[]>(() => getCart());
  const [catalogData, setCatalogData] = useState<CatalogData>(fallbackCatalog);
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [requestProduct, setRequestProduct] = useState<Product | null>(null);
  const [successModal, setSuccessModal] = useState<"order" | "request" | null>(null);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [loaderPhase, setLoaderPhase] = useState<"enter" | "exit">("enter");
  const routeRef = useRef<Route>(route);
  const transitionTimers = useRef<number[]>([]);

  useEffect(() => {
    const clearTransitionTimers = () => {
      transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
      transitionTimers.current = [];
    };

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      transitionTimers.current.push(timer);
    };

    schedule(() => setLoaderPhase("exit"), 1250);
    schedule(() => setLoaderVisible(false), 1580);

    const onHashChange = () => {
      const nextRoute = parseRoute(window.location.hash);
      const currentRoute = routeRef.current;
      clearTransitionTimers();

      if (currentRoute.page === "shop" && nextRoute.page === "shop") {
        routeRef.current = nextRoute;
        setLoaderVisible(false);
        setRoute(nextRoute);
        return;
      }

      setLoaderPhase("enter");
      setLoaderVisible(true);
      schedule(() => {
        routeRef.current = nextRoute;
        setRoute(nextRoute);
        window.scrollTo(0, 0);
      }, 430);
      schedule(() => setLoaderPhase("exit"), 1020);
      schedule(() => setLoaderVisible(false), 1360);
    };

    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      clearTransitionTimers();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const refreshCatalog = () => fetchCatalog().then((data) => {
      if (alive) setCatalogData(data);
    });
    refreshCatalog();

    const interval = window.setInterval(refreshCatalog, 10000);
    const onFocus = () => void refreshCatalog();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshCatalog();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const lines = useMemo(() => cartLines(cart, catalogData.products), [cart, catalogData.products]);

  function syncCart(nextCart: CartItem[]) {
    saveCart(nextCart);
    setCart(nextCart);
  }

  function handleAddToCart(productId: string, size: string) {
    setCart(addToCart(productId, size, catalogData.products));
  }

  function handleOpenRequest(product: Product) {
    setRequestProduct(product);
  }

  function handleRemoveFromCart(key: string) {
    setCart(removeFromCart(key));
  }

  function handleOrderComplete() {
    syncCart([]);
    setIsOrderOpen(false);
    setSuccessModal("order");
  }

  function handleRequestComplete() {
    setRequestProduct(null);
    setSuccessModal("request");
  }

  return (
    <>
      <Header count={cartCount(cart, catalogData.products)} />
      <main className={route.page === "home" ? "page home-page" : route.page === "shop" ? "page shop-page" : "page"}>
        {route.page === "home" && <HomePage catalogData={catalogData} onAddToCart={handleAddToCart} onRequest={handleOpenRequest} />}
        {route.page === "shop" && (
          <ShopPage catalogData={catalogData} category={route.category} onAddToCart={handleAddToCart} onRequest={handleOpenRequest} />
        )}
        {route.page === "product" && (
          <ProductPage catalogData={catalogData} id={route.id} onAddToCart={handleAddToCart} onRequest={handleOpenRequest} />
        )}
        {route.page === "cart" && <CartPage lines={lines} onRemove={handleRemoveFromCart} onCheckout={() => setIsOrderOpen(true)} />}
      </main>
      <Footer products={catalogData.products} />
      <OrderModal
        isOpen={isOrderOpen}
        lines={lines}
        onClose={() => setIsOrderOpen(false)}
        onOrderComplete={handleOrderComplete}
      />
      <ProductRequestModal product={requestProduct} onClose={() => setRequestProduct(null)} onRequestComplete={handleRequestComplete} />
      <SuccessModal type={successModal} onClose={() => setSuccessModal(null)} />
      {loaderVisible && <PageLoader phase={loaderPhase} />}
    </>
  );
}

function PageLoader({ phase }: { phase: "enter" | "exit" }) {
  return (
    <div className={`page-loader ${phase === "exit" ? "is-leaving" : ""}`} role="status" aria-label="Загрузка">
      <div className="loader-aura" aria-hidden="true" />
      <img className="loader-logo" src="/assets/loader-logo.png" alt="Direallised" />
      <div className="loader-line" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <header className="site-header">
      <a className="brand brand-logo header-logo-link" href="#/" aria-label="Direallised home">
        <img src="/assets/header-logo.png" alt="Direallised" />
      </a>
      <nav className="main-nav" aria-label="Основная навигация">
        <a href="#/">ГЛАВНАЯ</a>
        <a href="#/shop">КАТАЛОГ</a>
      </nav>
      <a className="cart-link" href="#/cart">
        КОРЗИНА (<span>{count}</span>)
      </a>
    </header>
  );
}

function HomePage({
  catalogData,
  onAddToCart,
  onRequest,
}: {
  catalogData: CatalogData;
  onAddToCart: (productId: string, size: string) => void;
  onRequest: (product: Product) => void;
}) {
  const { celebrityLooks, products } = catalogData;
  return (
    <>
      <section className="hero">
        <div className="hero-crossfade" aria-hidden="true">
          <img src={productPhotos[0]} alt="" />
          <img src={productPhotos[1]} alt="" />
          <img src={productPhotos[6]} alt="" />
        </div>
        <div className="hero-noise" aria-hidden="true" />
        <div className="hero-rail">
          <span>ONE PIECE</span>
          <span>DROP 001</span>
          <span>7 FRAMES</span>
        </div>
        <div className="hero-content">
          <div className="drop-note eyebrow">SS / 26 - ARTIFACT 001</div>
          <h1 className="hero-logo">Direallised</h1>
          <a className="btn-ghost hero-cta" href="#/shop">
            <span>СМОТРЕТЬ КАТАЛОГ -&gt;</span>
          </a>
        </div>
      </section>

      <section className="signal-strip" aria-label="Особенности Direallised">
        <div className="signal-marquee-track">
          <SignalMarqueeGroup />
          <SignalMarqueeGroup hidden />
          <SignalMarqueeGroup hidden />
          <SignalMarqueeGroup hidden />
        </div>
      </section>

      <section className="catalog-top">
        <span>{products.length} ТОВАР</span>
        <span>DROP 001</span>
      </section>
      <ProductGrid items={products} onAddToCart={onAddToCart} onRequest={onRequest} />

      <section className="star-index">
        <div className="star-copy">
          <p className="eyebrow">HANDMADE</p>
          <h2>
            <span>Каждая вещь</span>
            <span>делается вручную.</span>
          </h2>
          <p>
            Прокрас, потертости, нашивки, фурнитура и посадка собираются вручную. Поэтому каждая пара выходит как
            отдельный артефакт, а не серийная позиция с витрины.
          </p>
        </div>
        <div className="star-grid">
          {celebrityLooks.map((look, index) => (
            <article className="star-card" key={`${look.image}-${index}`}>
              <img src={look.image} alt={look.name ? `${look.name} in direallised` : "direallised look"} />
              {look.showText && (
                <div className="star-caption">
                  <span>0{index + 1}</span>
                  <strong>{look.name}</strong>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function ShopPage({
  catalogData,
  category,
  onAddToCart,
  onRequest,
}: {
  catalogData: CatalogData;
  category: CategoryId;
  onAddToCart: (productId: string, size: string) => void;
  onRequest: (product: Product) => void;
}) {
  const { categories: catalogCategories, catalogHeroPhotos, products } = catalogData;
  const activeCategory = catalogCategories.some((item) => item.id === category) ? category : "all";
  const activeLabel = catalogCategories.find((item) => item.id === activeCategory)?.label ?? "Все";
  const visibleProducts = activeCategory === "all" ? products : products.filter((product) => product.category === activeCategory);

  return (
    <>
      <section className="shop-hero">
        <div className="shop-hero-copy">
          <p className="eyebrow">CATALOG / DROP 001</p>
          <h1>Каталог.</h1>
          <p>
            Direallised собирает вещи с ручной фактурой, холодным блеском воска и деталями, которые выглядят как личный
            архив артиста.
          </p>
        </div>
        <div className="shop-visual" aria-hidden="true">
          {catalogHeroPhotos.map((src) => (
            <img src={src} alt="" key={src} />
          ))}
        </div>
      </section>
      <nav className="catalog-tabs" aria-label="Категории каталога">
        {catalogCategories.map((item) => {
          const count = item.id === "all" ? products.length : products.filter((product) => product.category === item.id).length;
          const href = item.id === "all" ? "#/shop" : `#/shop/${item.id}`;
          return (
            <a className={`catalog-tab ${item.id === activeCategory ? "active" : ""}`} href={href} key={item.id}>
              <span>{item.label}</span>
              <small>{count}</small>
            </a>
          );
        })}
      </nav>
      <section className="catalog-top">
        <span>{visibleProducts.length} ТОВАР</span>
        <span>{activeLabel}</span>
      </section>
      {visibleProducts.length ? (
        <ProductGrid items={visibleProducts} onAddToCart={onAddToCart} onRequest={onRequest} />
      ) : (
        <section className="empty-category">
          <p>— В ЭТОЙ КАТЕГОРИИ ПОКА НЕТ ТОВАРОВ —</p>
        </section>
      )}
    </>
  );
}

function ProductGrid({
  items,
  onAddToCart,
  onRequest,
}: {
  items: Product[];
  onAddToCart: (productId: string, size: string) => void;
  onRequest: (product: Product) => void;
}) {
  return (
    <section className="grid single-grid">
      {items.map((product) => (
        <article className="product-card" key={product.id} onClick={() => (window.location.hash = `#/product/${product.id}`)}>
          <div className="card-img">
            <img className="primary" src={product.images[0]} alt={product.title} />
            <img className="secondary" src={product.images[1] ?? product.images[0]} alt={product.title} />
          </div>
          <div className="card-info">
            <h3>{product.title}</h3>
            <p>{money(product.price)}</p>
          </div>
          <button
            className="add-inline"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (product.fulfillment === "preorder") onRequest(product);
              else onAddToCart(product.id, product.sizes[0]);
            }}
          >
            {product.fulfillment === "preorder" ? "ОФОРМИТЬ ЗАЯВКУ" : "+ В КОРЗИНУ"}
          </button>
        </article>
      ))}
    </section>
  );
}

function ProductPage({
  catalogData,
  id,
  onAddToCart,
  onRequest,
}: {
  catalogData: CatalogData;
  id: string;
  onAddToCart: (productId: string, size: string) => void;
  onRequest: (product: Product) => void;
}) {
  const product = catalogData.products.find((item) => item.id === id) ?? catalogData.products[0] ?? fallbackCatalog.products[0];
  const [pickedSize, setPickedSize] = useState(product.sizes[0]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setPickedSize(product.sizes[0]);
    setActivePhoto(0);
    setAdded(false);
  }, [product]);

  function switchPhoto(direction: number) {
    setActivePhoto((current) => (current + direction + product.images.length) % product.images.length);
  }

  return (
    <section className="product-page">
      <div className="product-gallery">
        <div className="gallery-main">
          <button className="gallery-arrow gallery-arrow-left" type="button" onClick={() => switchPhoto(-1)} aria-label="Предыдущее фото">
            ‹
          </button>
          <img id="gallery-main-img" src={product.images[activePhoto]} alt={product.title} />
          <button className="gallery-arrow gallery-arrow-right" type="button" onClick={() => switchPhoto(1)} aria-label="Следующее фото">
            ›
          </button>
        </div>
        <div className="gallery-thumbs">
          {product.images.map((src, index) => (
            <button
              className={`thumb ${index === activePhoto ? "active" : ""}`}
              type="button"
              onClick={() => setActivePhoto(index)}
              key={src}
            >
              <img src={src} alt={`${product.title} ${index + 1}`} />
            </button>
          ))}
        </div>
      </div>
      <div className="product-info">
        <div className="crumb">
          <a href="#/shop">КАТАЛОГ</a> / {product.title}
        </div>
        <h1>{product.title}</h1>
        <div className="price">{money(product.price)}</div>
        <div className="desc">{product.desc}</div>
        <div className="divider" />
        <div className="size-block">
          <div className="label">РАЗМЕР</div>
          <div className="sizes">
            {product.sizes.map((size) => (
              <button className={size === pickedSize ? "active" : ""} type="button" onClick={() => setPickedSize(size)} key={size}>
                {size}
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn-primary"
          type="button"
          disabled={added}
          onClick={() => {
            if (product.fulfillment === "preorder") {
              onRequest(product);
              return;
            }
            onAddToCart(product.id, pickedSize);
            setAdded(true);
            window.setTimeout(() => setAdded(false), 1100);
          }}
        >
          {product.fulfillment === "preorder" ? "ОФОРМИТЬ ЗАЯВКУ" : added ? "ДОБАВЛЕНО В КОРЗИНУ" : "ДОБАВИТЬ В КОРЗИНУ"}
        </button>
        <div className="product-meta">
          <div>
            <span>КАТЕГОРИЯ</span>
            <span>ДЖИНСЫ</span>
          </div>
          <div>
            <span>ДОСТАВКА</span>
            <span>2-7 ДНЕЙ</span>
          </div>
          <div>
            <span>ПРОИЗВОДСТВО</span>
            <span>РОССИЯ</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CartPage({ lines, onRemove, onCheckout }: { lines: CartLine[]; onRemove: (key: string) => void; onCheckout: () => void }) {
  if (!lines.length) {
    return (
      <section className="cart-page">
        <h1>Корзина.</h1>
        <div className="cart-empty">
          <p>- КОРЗИНА ПУСТА -</p>
          <a href="#/shop">ПРОДОЛЖИТЬ ПОКУПКИ</a>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-page">
      <h1>Корзина.</h1>
      <div className="cart-list">
        {lines.map((item) => (
          <article className="cart-item" key={item.key}>
            <img src={item.product.images[0]} alt={item.product.title} />
            <div>
              <p className="cart-title">{item.product.title}</p>
              <div className="cart-note">
                РАЗМЕР: {item.size} / КОЛ-ВО: {item.qty}
              </div>
            </div>
            <div className="cart-tools">
              <span>{money(item.total)}</span>
              <button className="remove-btn" type="button" onClick={() => onRemove(item.key)}>
                УДАЛИТЬ
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="cart-summary">
        <div className="cart-total">
          <span>ИТОГО</span>
          <span>{money(lines.reduce((sum, item) => sum + item.total, 0))}</span>
        </div>
        <button className="btn-primary" type="button" onClick={onCheckout}>
          ОФОРМИТЬ ЗАКАЗ
        </button>
      </div>
    </section>
  );
}

function OrderModal({
  isOpen,
  lines,
  onClose,
  onOrderComplete,
}: {
  isOpen: boolean;
  lines: CartLine[];
  onClose: () => void;
  onOrderComplete: () => void;
}) {
  const [promo, setPromo] = useState("");
  const [discount, setDiscount] = useState(0);
  const [promoStatus, setPromoStatus] = useState("");
  const [orderState, setOrderState] = useState("");

  const subtotal = lines.reduce((sum, item) => sum + item.total, 0);
  const total = Math.max(0, subtotal - discount);

  useEffect(() => {
    if (!isOpen) return;
    setPromo("");
    setDiscount(0);
    setPromoStatus("");
    setOrderState("");
  }, [isOpen]);

  async function applyPromo() {
    const code = promo.trim().toUpperCase();
    if (!code) {
      setDiscount(0);
      setPromoStatus("");
      return;
    }

    const promoData = await fetchPromo(code);
    if (promoData) {
      const nextDiscount = promoData.type === "percent" ? Math.round(subtotal * (promoData.value / 100)) : promoData.value;
      setDiscount(Math.min(subtotal, nextDiscount));
      setPromoStatus("ПРОМОКОД ПРИМЕНЕН");
    } else {
      setDiscount(0);
      setPromoStatus("ПРОМОКОД НЕ НАЙДЕН");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const customer = Object.fromEntries(formData.entries()) as unknown as OrderFormData;
    setOrderState("ОТПРАВЛЯЕМ ЗАКАЗ...");
    try {
      await submitOrder({ items: lines, total, discount, customer });
      setOrderState("ЗАКАЗ СОБРАН. МЫ СВЯЖЕМСЯ С ВАМИ.");
      onOrderComplete();
    } catch {
      setOrderState("НЕ УДАЛОСЬ ОТПРАВИТЬ ЗАКАЗ. ПРОВЕРЬТЕ, ЧТО API И БОТ ЗАПУЩЕНЫ.");
    }
  }

  return (
    <div className={`modal-overlay ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="close-modal" type="button" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
        <h2 id="modal-title">Оформить заказ.</h2>
        <div className="modal-sub">{lines.map((item) => `${item.product.title} - РАЗМЕР: ${item.size}`).join(" / ")}</div>
        <div>
          {lines.map((item) => (
            <div className="modal-item" key={item.key}>
              <span>
                {item.product.title} / {item.size} × {item.qty}
              </span>
              <span>{money(item.total)}</span>
            </div>
          ))}
        </div>

        <section className="promo-section">
          <h4>ПРОМОКОД</h4>
          <div className="promo-row">
            <input value={promo} onChange={(event) => setPromo(event.target.value)} autoComplete="off" placeholder="ВВЕДИТЕ ПРОМОКОД" />
            <button type="button" onClick={() => void applyPromo()}>
              ПРИМЕНИТЬ
            </button>
          </div>
          <div className="promo-status">{promoStatus}</div>
        </section>

        <div className="modal-total">
          <span>ИТОГО</span>
          <span>{money(total)}</span>
        </div>

        <form className="order-form" onSubmit={onSubmit}>
          <h4>КОНТАКТНЫЕ ДАННЫЕ</h4>
          <label>
            <span>EMAIL / TELEGRAM</span>
            <input name="contact" autoComplete="email" required />
          </label>
          <label>
            <span>ИМЯ И ФАМИЛИЯ</span>
            <input name="name" autoComplete="name" required />
          </label>
          <label>
            <span>ТЕЛЕФОН</span>
            <input name="phone" autoComplete="tel" required />
          </label>

          <h4>ДОСТАВКА СДЭК</h4>
          <label>
            <span>ГОРОД</span>
            <input name="city" required />
          </label>
          <label>
            <span>АДРЕС ПУНКТА ВЫДАЧИ / АДРЕС</span>
            <input name="address" placeholder="Улица, дом" required />
          </label>
          <label>
            <span>КОММЕНТАРИЙ (необязательно)</span>
            <textarea name="comment" rows={3} />
          </label>

          <button className="confirm-order" type="submit">
            ПОДТВЕРДИТЬ ЗАКАЗ - {money(total)}
          </button>
          <div className="order-state" aria-live="polite">
            {orderState}
          </div>
        </form>
      </section>
    </div>
  );
}

function ProductRequestModal({
  product,
  onClose,
  onRequestComplete,
}: {
  product: Product | null;
  onClose: () => void;
  onRequestComplete: () => void;
}) {
  const [requestState, setRequestState] = useState("");
  const isOpen = Boolean(product);

  useEffect(() => {
    if (isOpen) setRequestState("");
  }, [isOpen, product?.id]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!product) return;
    const formData = new FormData(form);
    const customer = Object.fromEntries(formData.entries()) as unknown as ProductRequestFormData;
    setRequestState("ОТПРАВЛЯЕМ ЗАЯВКУ...");
    try {
      await submitProductRequest({ product, customer });
      form.reset();
      onRequestComplete();
    } catch {
      setRequestState("НЕ УДАЛОСЬ ОТПРАВИТЬ ЗАЯВКУ. ПРОВЕРЬТЕ, ЧТО API И БОТ ЗАПУЩЕНЫ.");
    }
  }

  return (
    <div className={`modal-overlay ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title">
        <button className="close-modal" type="button" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
        <h2 id="request-title">Оформить заявку.</h2>
        {product && (
          <>
            <div className="modal-sub">
              {product.title} / {money(product.price)}
            </div>
            <form className="order-form" onSubmit={onSubmit}>
              <h4>КОНТАКТ ДЛЯ СВЯЗИ</h4>
              <label>
                <span>TELEGRAM</span>
                <input name="telegram" placeholder="@username" required />
              </label>
              <label>
                <span>КОММЕНТАРИЙ</span>
                <textarea name="comment" rows={4} placeholder="Размер, пожелания, вопрос по позиции" />
              </label>
              <button className="confirm-order" type="submit">
                ОТПРАВИТЬ ЗАЯВКУ
              </button>
              <div className="order-state" aria-live="polite">
                {requestState}
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function SuccessModal({ type, onClose }: { type: "order" | "request" | null; onClose: () => void }) {
  const isOpen = Boolean(type);
  const title = type === "order" ? "Заказ принят" : "Заявка отправлена";

  return (
    <div className={`modal-overlay success-overlay ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
        <button className="close-modal" type="button" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
        <div className="success-check" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle className="success-check-ring" cx="60" cy="60" r="48" />
            <path className="success-check-mark" d="M37 61.5 52.4 76.8 84.5 43.5" />
          </svg>
        </div>
        <div className="success-kicker">Direallised / request accepted</div>
        <h2 id="success-title">{title}</h2>
        <p>
          Спасибо за обращение. В ближайшее время менеджер свяжется с вами и уточнит детали. Если хотите ускорить процесс,
          напишите напрямую в Telegram: <a href="https://t.me/sukkui0" target="_blank" rel="noreferrer">@sukkui0</a>.
        </p>
        <button className="success-action" type="button" onClick={onClose}>
          ПОНЯТНО
        </button>
      </section>
    </div>
  );
}

function SocialIcon({ name }: { name: "instagram" | "telegram" }) {
  if (name === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="15" rx="4.2" />
        <circle cx="12" cy="12" r="3.4" />
        <path d="M16.7 7.4h.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 4.8 3.8 11.4l6.3 2.2 2.3 6.1 3.2-4.2 4.8-10.7Z" />
      <path d="m10.1 13.6 5.5-5.1" />
    </svg>
  );
}

function Footer({ products }: { products: Product[] }) {
  const firstProduct = products[0];
  return (
    <footer className="site-footer">
      <div className="footer-mark footer-logo">
        <img src="/assets/footer-logo.png" alt="Direallised" />
      </div>
      <div className="footer-col">
        <h4>КАТАЛОГ</h4>
        <a href="#/shop">Drop 001</a>
        {firstProduct && <a href={`#/product/${firstProduct.id}`}>{firstProduct.title}</a>}
      </div>
      <div className="footer-col">
        <h4>ИНФОРМАЦИЯ</h4>
        <a href="#/">Главная</a>
        <a href="#/cart">Корзина</a>
      </div>
      <div className="footer-col">
        <h4>КОНТАКТЫ</h4>
        <a className="social-link" href="https://www.instagram.com/direallised/" target="_blank" rel="noreferrer">
          <span className="social-icon">
            <SocialIcon name="instagram" />
          </span>
          <span>Instagram</span>
        </a>
        <a className="social-link" href="https://t.me/direallised" target="_blank" rel="noreferrer">
          <span className="social-icon">
            <SocialIcon name="telegram" />
          </span>
          <span>Telegram channel</span>
        </a>
        <a className="social-link" href="https://t.me/sukkui0" target="_blank" rel="noreferrer">
          <span className="social-icon">
            <SocialIcon name="telegram" />
          </span>
          <span>Manager / @sukkui0</span>
        </a>
      </div>
      <div className="footer-base">
        <span>© 2026 DIREALLISED</span>
        <span>ONE PIECE / ONE DROP</span>
      </div>
    </footer>
  );
}
