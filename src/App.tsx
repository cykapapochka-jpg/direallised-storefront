import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { catalogCategories, catalogHeroPhotos, celebrityLooks, getProductById, productPhotos, products } from "./data/catalog";
import { addToCart, cartCount, cartLines, getCart, removeFromCart, saveCart } from "./lib/cart";
import { money } from "./lib/money";
import { submitOrder } from "./services/orders";
import type { CartItem, CartLine, CategoryId, OrderFormData, Product } from "./types";

type Route =
  | { page: "home" }
  | { page: "shop"; category: CategoryId }
  | { page: "product"; id: string }
  | { page: "cart" };

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

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [cart, setCart] = useState<CartItem[]>(() => getCart());
  const [isOrderOpen, setIsOrderOpen] = useState(false);
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

  const lines = useMemo(() => cartLines(cart), [cart]);

  function syncCart(nextCart: CartItem[]) {
    saveCart(nextCart);
    setCart(nextCart);
  }

  function handleAddToCart(productId: string, size: string) {
    setCart(addToCart(productId, size));
  }

  function handleRemoveFromCart(key: string) {
    setCart(removeFromCart(key));
  }

  function handleOrderComplete() {
    syncCart([]);
  }

  return (
    <>
      <Header count={cartCount(cart)} />
      <main className={route.page === "home" ? "page home-page" : route.page === "shop" ? "page shop-page" : "page"}>
        {route.page === "home" && <HomePage onAddToCart={handleAddToCart} />}
        {route.page === "shop" && <ShopPage category={route.category} onAddToCart={handleAddToCart} />}
        {route.page === "product" && <ProductPage id={route.id} onAddToCart={handleAddToCart} />}
        {route.page === "cart" && <CartPage lines={lines} onRemove={handleRemoveFromCart} onCheckout={() => setIsOrderOpen(true)} />}
      </main>
      <Footer />
      <OrderModal
        isOpen={isOrderOpen}
        lines={lines}
        onClose={() => setIsOrderOpen(false)}
        onOrderComplete={handleOrderComplete}
      />
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

function HomePage({ onAddToCart }: { onAddToCart: (productId: string, size: string) => void }) {
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
            СМОТРЕТЬ КАТАЛОГ -&gt;
          </a>
        </div>
      </section>

      <section className="signal-strip" aria-label="direallised signals">
        <span>BLACK LEATHER PATCH FLARED JEANS</span>
        <span>SEEN ON STAGE</span>
        <span>UNDERGROUND FIT ARCHIVE</span>
        <span>ONE PIECE DROP</span>
      </section>

      <section className="catalog-top">
        <span>{products.length} ТОВАР</span>
        <span>DROP 001</span>
      </section>
      <ProductGrid items={products} onAddToCart={onAddToCart} />

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

function ShopPage({ category, onAddToCart }: { category: CategoryId; onAddToCart: (productId: string, size: string) => void }) {
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
        <ProductGrid items={visibleProducts} onAddToCart={onAddToCart} />
      ) : (
        <section className="empty-category">
          <p>— В ЭТОЙ КАТЕГОРИИ ПОКА НЕТ ТОВАРОВ —</p>
        </section>
      )}
    </>
  );
}

function ProductGrid({ items, onAddToCart }: { items: Product[]; onAddToCart: (productId: string, size: string) => void }) {
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
              onAddToCart(product.id, product.sizes[0]);
            }}
          >
            + В КОРЗИНУ
          </button>
        </article>
      ))}
    </section>
  );
}

function ProductPage({ id, onAddToCart }: { id: string; onAddToCart: (productId: string, size: string) => void }) {
  const product = getProductById(id);
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
            onAddToCart(product.id, pickedSize);
            setAdded(true);
            window.setTimeout(() => setAdded(false), 1100);
          }}
        >
          {added ? "ДОБАВЛЕНО В КОРЗИНУ" : "ДОБАВИТЬ В КОРЗИНУ"}
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

  function applyPromo() {
    const code = promo.trim().toUpperCase();
    if (code === "DIRE10") {
      setDiscount(Math.round(subtotal * 0.1));
      setPromoStatus("ПРОМОКОД ПРИМЕНЕН");
    } else if (code) {
      setDiscount(0);
      setPromoStatus("ПРОМОКОД НЕ НАЙДЕН");
    } else {
      setDiscount(0);
      setPromoStatus("");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const customer = Object.fromEntries(formData.entries()) as unknown as OrderFormData;
    await submitOrder({ items: lines, total, discount, customer });
    setOrderState("ЗАКАЗ СОБРАН. МЫ СВЯЖЕМСЯ С ВАМИ.");
    onOrderComplete();
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
            <button type="button" onClick={applyPromo}>
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

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-mark footer-logo">
        <img src="/assets/footer-logo.png" alt="Direallised" />
      </div>
      <div className="footer-col">
        <h4>КАТАЛОГ</h4>
        <a href="#/shop">Drop 001</a>
        <a href="#/product/BLPFJ">Black Leather Patch Flared Jeans</a>
      </div>
      <div className="footer-col">
        <h4>ИНФОРМАЦИЯ</h4>
        <a href="#/">Главная</a>
        <a href="#/cart">Корзина</a>
      </div>
      <div className="footer-col">
        <h4>КОНТАКТЫ</h4>
        <a href="https://t.me/" target="_blank" rel="noreferrer">
          ТГ -&gt; @direallised
        </a>
      </div>
      <div className="footer-base">
        <span>© 2026 DIREALLISED</span>
        <span>ONE PIECE / ONE DROP</span>
      </div>
    </footer>
  );
}
