"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeIndianPhone } from "@/lib/validation";
import TurnstileWidget from "@/components/TurnstileWidget";

type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  unit: string;
  image_url: string;
  video_url: string;
  active: boolean;
};

type CartItem = {
  product: Product;
  quantity: number;
};

const sampleProducts: Product[] = [
  { id: "sample-1", name: "Mitti Ka Diya", category: "Diya & Lighting", description: "Traditional earthen diyas for Diwali.", price: 10, stock: 100, unit: "piece", image_url: "", video_url: "", active: true },
  { id: "sample-2", name: "Colourful Diya", category: "Diya & Lighting", description: "Colourful decorative diya.", price: 25, stock: 40, unit: "piece", image_url: "", video_url: "", active: true },
  { id: "sample-3", name: "Lakshmi Ganesh Murti", category: "Idols & Murtis", description: "A festive pair for your home mandir.", price: 180, stock: 18, unit: "set", image_url: "", video_url: "", active: true },
  { id: "sample-4", name: "Brass Pooja Murti", category: "Idols & Murtis", description: "Traditional brass pooja murti.", price: 650, stock: 6, unit: "piece", image_url: "", video_url: "", active: true },
  { id: "sample-5", name: "Flower Mala", category: "Garlands & Decor", description: "Decorative mala for your pooja.", price: 60, stock: 30, unit: "piece", image_url: "", video_url: "", active: true },
  { id: "sample-6", name: "Shubh Labh Sticker", category: "Stickers & Rangoli", description: "Festive entrance sticker set.", price: 30, stock: 0, unit: "pack", image_url: "", video_url: "", active: true },
  { id: "sample-7", name: "Pooja Aasan", category: "Pooja Essentials", description: "Aasan for daily pooja.", price: 90, stock: 15, unit: "piece", image_url: "", video_url: "", active: true },
  { id: "sample-8", name: "Pooja Chunni", category: "Pooja Essentials", description: "Traditional chunni for pooja.", price: 75, stock: 11, unit: "piece", image_url: "", video_url: "", active: true },
  { id: "sample-9", name: "Festival Jhaadu", category: "Brooms", description: "A household festive essential.", price: 55, stock: 22, unit: "piece", image_url: "", video_url: "", active: true },
];

const categoryMeta: Record<string, { icon: string; colour: string }> = {
  "Diya & Lighting": { icon: "🪔", colour: "peach" },
  "Idols & Murtis": { icon: "🛕", colour: "pink" },
  "Pooja Essentials": { icon: "🙏", colour: "cream" },
  "Garlands & Decor": { icon: "🌼", colour: "green" },
  "Stickers & Rangoli": { icon: "✨", colour: "lavender" },
  Brooms: { icon: "🧹", colour: "cream" },
  Other: { icon: "🎁", colour: "peach" },
};

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function createOrderKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export default function Storefront() {
  const supabase = useMemo(() => createClient(), []);
  const liveReady = Boolean(supabase);

  const [products, setProducts] = useState<Product[]>(
    liveReady ? [] : sampleProducts,
  );
  const [loading, setLoading] = useState(liveReady);
  const [loadError, setLoadError] = useState("");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All products");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [name, setName] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [address, setAddress] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  /*
   * FIXED:
   * Narrow Supabase client to a non-null type BEFORE passing it
   * into the async function. This fixes "client is possibly null".
   */
  useEffect(() => {
    const client = supabase;

    if (!client) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProducts(
      db: NonNullable<typeof supabase>,
    ): Promise<void> {
      try {
        const { data, error: queryError } = await db
          .from("products")
          .select(
            "id,name,category,description,price,stock,unit,image_url,video_url,active",
          )
          .eq("active", true)
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (queryError) {
          setLoadError(
            "Products could not load. Please check your Supabase setup.",
          );
        } else {
          setProducts((data ?? []) as Product[]);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load products. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts(client);

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("shagunwala-cart-v1");
      if (saved) {
        setCart(JSON.parse(saved) as Record<string, number>);
      }
    } catch {
      // Ignore invalid cart data.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "shagunwala-cart-v1",
        JSON.stringify(cart),
      );
    } catch {
      // Local storage is optional.
    }
  }, [cart]);

  const categories = useMemo(
    () => [
      "All products",
      ...Array.from(new Set(products.map((p) => p.category))).sort(),
    ],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const search = query.toLowerCase().trim();

    return products.filter((product) => {
      const searchable =
        `${product.name} ${product.category} ${product.description}`.toLowerCase();

      return (
        searchable.includes(search) &&
        (category === "All products" || product.category === category)
      );
    });
  }, [products, query, category]);

  const cartItems: CartItem[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({
          product: products.find((p) => p.id === id),
          quantity,
        }))
        .filter(
          (item): item is CartItem => Boolean(item.product),
        ),
    [cart, products],
  );

  const cartCount = cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const total = cartItems.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );

  function add(product: Product) {
    if (product.stock <= 0) return;

    setCart((current) => {
      const quantity = current[product.id] ?? 0;
      if (quantity >= product.stock) return current;

      return {
        ...current,
        [product.id]: quantity + 1,
      };
    });
  }

  function setQuantity(id: string, quantity: number) {
    const stock = products.find((p) => p.id === id)?.stock ?? 0;

    setCart((current) => {
      if (quantity <= 0) {
        const updated = { ...current };
        delete updated[id];
        return updated;
      }

      return {
        ...current,
        [id]: Math.min(quantity, stock),
      };
    });
  }

  function openCheckout() {
    setCartOpen(false);
    setCheckoutOpen(true);
    setError("");
    setCaptchaToken("");
    setIdempotencyKey(createOrderKey());
  }

  function closeCheckout() {
    if (busy) return;

    setCheckoutOpen(false);
    setError("");
    setCaptchaToken("");
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedPhone = normalizeIndianPhone(phoneInput);

    if (name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!normalizedPhone) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (address.trim().length < 10) {
      setError("Please enter your complete delivery address.");
      return;
    }

    if (cartItems.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured. Please check .env.local.");
      return;
    }

    if (!captchaToken && process.env.NODE_ENV === "production") {
      setError("Please complete the security check before ordering.");
      return;
    }

    if (!idempotencyKey) {
      setError("Please close and reopen checkout, then try again.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: normalizedPhone,
          address: address.trim(),
          items: cartItems.map(({ product, quantity }) => ({
            product_id: product.id,
            quantity,
          })),
          idempotency_key: idempotencyKey,
          captchaToken,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          result.error ||
            "Your order could not be submitted. Please try again.",
        );
        return;
      }

      setOrderId(String(result.orderId || ""));
      setCheckoutOpen(false);
      setCart({});
      setCaptchaToken("");

      alert(
        `Order request received!\nOrder ID: ${result.orderId || "Submitted"}\nStatus: Pending Confirmation`,
      );
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="announcement">
        <span>✦</span> Celebrate every occasion with ShagunWala{" "}
        <span>✦</span>
      </div>

      <header className="site-header">
        <Link className="brand" href="/" aria-label="ShagunWala home">
          <span className="brand-mark">🪔</span>
          <span>
            <strong>ShagunWala</strong>
            <small>Har Tyohar Ka Apna Shagun</small>
          </span>
        </Link>

        <nav className="desktop-nav">
          <a href="#collections">Collections</a>
          <a href="#products">Shop products</a>
          <a href="#about">Our promise</a>
        </nav>

        <div className="header-actions">
          <button
            className="icon-button cart-top"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
          >
            Bag <span>{cartCount}</span>
          </button>
          <Link className="admin-link" href="/admin/login">
            Admin
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span>✧</span> FESTIVE FINDS, THOUGHTFULLY PICKED
          </span>
          <h1>
            Little things.
            <br />
            <em>Beautiful traditions.</em>
          </h1>
          <p>
            From glowing diyas to pooja murtis and festive decorations,
            find the essentials that make every celebration special.
          </p>
          <div className="hero-actions">
            <a href="#products" className="button button-primary">
              Explore the collection <span>↗</span>
            </a>
            <button
              className="button button-quiet"
              onClick={() => setCartOpen(true)}
            >
              View bag ({cartCount})
            </button>
          </div>
          <div className="hero-trust">
            <span>✦ Carefully selected essentials</span>
            <span>✦ Personal service from our shop</span>
          </div>
        </div>

        <div className="hero-art">
          <div className="sun-disc" />
          <div className="hero-flower flower-a">✿</div>
          <div className="hero-flower flower-b">✿</div>
          <div className="hero-arch">
            <div className="hero-art-center">
              <span className="hero-big-diya">🪔</span>
              <span className="hero-art-label">
                A little light goes a long way
              </span>
            </div>
          </div>
          <div className="floating-chip chip-left">🌼 Festive decor</div>
          <div className="floating-chip chip-right">🙏 Pooja essentials</div>
        </div>
      </section>

      <section className="benefits-strip">
        <div>
          <span>✦</span>
          <p>
            <strong>Made for traditions</strong>
            <small>Everyday pooja to festive moments</small>
          </p>
        </div>
        <div>
          <span>◈</span>
          <p>
            <strong>Simple shopping</strong>
            <small>Browse, choose and send your order</small>
          </p>
        </div>
        <div>
          <span>♡</span>
          <p>
            <strong>Personal service</strong>
            <small>We confirm every order with care</small>
          </p>
        </div>
      </section>

      <section id="collections" className="section collections-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FIND YOUR FESTIVE FAVOURITES</span>
            <h2>Shop by collection</h2>
          </div>
          <a href="#products" className="text-link">
            Browse all products <span>→</span>
          </a>
        </div>

        <div className="category-grid">
          {categories
            .filter((item) => item !== "All products")
            .map((item) => (
              <button
                className={`category-card ${
                  categoryMeta[item]?.colour || "cream"
                }`}
                key={item}
                onClick={() => {
                  setCategory(item);
                  document
                    .getElementById("products")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span className="category-icon">
                  {categoryMeta[item]?.icon || "🎁"}
                </span>
                <strong>{item}</strong>
                <small>
                  Explore collection <span>↗</span>
                </small>
              </button>
            ))}
        </div>
      </section>

      <section id="products" className="section products-section">
        <div className="section-heading product-heading">
          <div>
            <span className="eyebrow">A LITTLE SOMETHING FOR YOUR HOME</span>
            <h2>Festive essentials</h2>
            <p className="muted">
              Product prices and stock are updated by our shop.
            </p>
          </div>

          <div className="product-tools">
            <label className="search-box">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products..."
                aria-label="Search products"
              />
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filter by category"
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        {!liveReady && (
          <div className="preview-banner">
            <strong>Preview mode</strong>
            <span>
              Sample products are shown. Connect Supabase to show live
              products and receive customer order requests.
            </span>
          </div>
        )}

        {loadError && (
          <div className="form-error inline-error">{loadError}</div>
        )}

        {loading ? (
          <div className="loading-state">Loading the collection…</div>
        ) : visibleProducts.length > 0 ? (
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const meta = categoryMeta[product.category] || {
                icon: "🎁",
                colour: "cream",
              };
              const inCart = cart[product.id] || 0;

              return (
                <article className="product-card" key={product.id}>
                  <div className={`product-image ${meta.colour}`}>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                      />
                    ) : (
                      <span className="product-placeholder-icon">
                        {meta.icon}
                      </span>
                    )}

                    <span
                      className={`stock-badge ${
                        product.stock <= 0
                          ? "stock-out"
                          : product.stock <= 5
                            ? "stock-low"
                            : ""
                      }`}
                    >
                      {product.stock <= 0
                        ? "Out of stock"
                        : product.stock <= 5
                          ? `Only ${product.stock} left`
                          : "In stock"}
                    </span>

                    {product.video_url && (
                      <a
                        className="video-chip"
                        href={product.video_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ▶ View video
                      </a>
                    )}
                  </div>

                  <div className="product-card-body">
                    <span className="product-category">
                      {product.category}
                    </span>
                    <h3>{product.name}</h3>
                    <p>
                      {product.description ||
                        "A lovely pick for your festive home."}
                    </p>
                    <div className="product-bottom">
                      <div>
                        <strong>{money(Number(product.price))}</strong>
                        <small>per {product.unit || "piece"}</small>
                      </div>
                      <button
                        className="add-button"
                        onClick={() => add(product)}
                        disabled={
                          product.stock <= 0 || inCart >= product.stock
                        }
                      >
                        {product.stock <= 0
                          ? "Unavailable"
                          : inCart
                            ? `Added (${inCart}) +`
                            : "+ Add to bag"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span>✧</span>
            <h3>
              {liveReady
                ? "Your collection is getting ready"
                : "No products found"}
            </h3>
            <p>
              {liveReady
                ? "The shop admin can add products from the admin panel."
                : "Try a different search or category."}
            </p>
            {liveReady && (
              <Link className="button button-outline" href="/admin/login">
                Open admin panel
              </Link>
            )}
          </div>
        )}
      </section>

      <section id="about" className="promise-section">
        <div className="promise-art">
          <span className="promise-spark">✳</span>
          <span className="promise-diya">🪔</span>
          <span className="promise-spark spark-two">✳</span>
        </div>
        <div>
          <span className="eyebrow">A SHOP THAT FEELS CLOSE TO HOME</span>
          <h2>
            Traditions deserve
            <br />
            <em>the little details.</em>
          </h2>
          <p>
            We bring together pooja essentials, handmade touches and festive
            favourites for every auspicious moment. Browse at your own pace
            and place an order when ready.
          </p>
          <a href="#products" className="text-link">
            Find your favourites <span>→</span>
          </a>
        </div>
      </section>

      <section className="contact-band">
        <div>
          <span className="eyebrow">NEED A HAND?</span>
          <h2>Not sure what you need?</h2>
          <p>
            Browse the catalogue or contact the shop for availability and
            order confirmation.
          </p>
        </div>
        <a href="#products" className="button button-light">
          Explore products <span>↗</span>
        </a>
      </section>

      <footer className="site-footer">
        <Link className="brand footer-brand" href="/">
          <span className="brand-mark">🪔</span>
          <span>
            <strong>ShagunWala</strong>
            <small>Har Tyohar Ka Apna Shagun</small>
          </span>
        </Link>
        <p>Made with care for every celebration.</p>
        <Link href="/admin/login">Shop admin</Link>
        <small>© {new Date().getFullYear()} ShagunWala</small>
      </footer>

      {cartOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setCartOpen(false)}
        >
          <aside
            className="cart-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">YOUR SELECTION</span>
                <h2>
                  Your bag <small>({cartCount})</small>
                </h2>
              </div>
              <button
                className="close-button"
                onClick={() => setCartOpen(false)}
                aria-label="Close bag"
              >
                ×
              </button>
            </div>

            {cartItems.length > 0 ? (
              <>
                <div className="drawer-items">
                  {cartItems.map(({ product, quantity }) => (
                    <div className="drawer-item" key={product.id}>
                      <div
                        className={`drawer-item-art ${
                          categoryMeta[product.category]?.colour || "cream"
                        }`}
                      >
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} />
                        ) : (
                          categoryMeta[product.category]?.icon || "🎁"
                        )}
                      </div>
                      <div className="drawer-item-main">
                        <strong>{product.name}</strong>
                        <small>
                          {money(Number(product.price))} / {product.unit}
                        </small>
                        <div className="qty-stepper">
                          <button
                            onClick={() =>
                              setQuantity(product.id, quantity - 1)
                            }
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span>{quantity}</span>
                          <button
                            onClick={() =>
                              setQuantity(product.id, quantity + 1)
                            }
                            disabled={quantity >= product.stock}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <strong className="line-price">
                        {money(Number(product.price) * quantity)}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="drawer-total">
                  <span>Estimated total</span>
                  <strong>{money(total)}</strong>
                </div>
                <p className="checkout-note">
                  Final availability and delivery charges, if any, will be
                  confirmed by the shop.
                </p>
                <button
                  className="button button-primary full-width"
                  onClick={openCheckout}
                >
                  Continue to checkout <span>→</span>
                </button>
              </>
            ) : (
              <div className="empty-cart">
                <span>✧</span>
                <h3>Your bag is waiting</h3>
                <p>Explore the collection and add something special.</p>
                <button
                  className="button button-primary"
                  onClick={() => setCartOpen(false)}
                >
                  Continue shopping
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div className="modal-backdrop" onClick={closeCheckout}>
          <section
            className="checkout-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">ORDER CHECKOUT</span>
                <h2 id="checkout-title">Place your order</h2>
              </div>
              <button
                className="close-button"
                onClick={closeCheckout}
                aria-label="Close checkout"
              >
                ×
              </button>
            </div>

            <div className="checkout-steps">
              <span className="active">
                1 <small>Your details</small>
              </span>
              <i />
              <span className="active">
                2 <small>Security check</small>
              </span>
              <i />
              <span>
                3 <small>Confirmation</small>
              </span>
            </div>

            <form className="checkout-form" onSubmit={placeOrder}>
              <label>
                Full name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                  maxLength={100}
                  minLength={2}
                  required
                />
              </label>

              <label>
                Mobile number
                <span className="phone-input">
                  <span>🇮🇳 +91</span>
                  <input
                    autoComplete="tel-national"
                    inputMode="numeric"
                    value={phoneInput}
                    onChange={(event) =>
                      setPhoneInput(
                        event.target.value
                          .replace(/[^\d+\s-]/g, "")
                          .slice(0, 14),
                      )
                    }
                    placeholder="10-digit mobile number"
                    required
                  />
                </span>
              </label>

              <label>
                Full delivery address
                <textarea
                  autoComplete="street-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="House / street, area, city, state, PIN code"
                  minLength={10}
                  maxLength={800}
                  rows={3}
                  required
                />
              </label>

              <div className="checkout-total-line">
                <span>Estimated total ({cartCount} items)</span>
                <strong>{money(total)}</strong>
              </div>

              <TurnstileWidget onToken={setCaptchaToken} />

              <button
                className="button button-primary full-width"
                type="submit"
                disabled={busy}
              >
                {busy ? "Submitting order…" : "Submit order request"}{" "}
                <span>→</span>
              </button>

              <p className="tiny-note">
                No SMS OTP or payment is needed. Your order remains pending
                until the shop confirms it by phone or WhatsApp.
              </p>

              {error && <p className="form-error">{error}</p>}
            </form>
          </section>
        </div>
      )}
    </main>
  );
}