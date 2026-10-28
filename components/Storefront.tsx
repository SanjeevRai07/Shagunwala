"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeIndianPhone } from "@/lib/validation";

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
  {
    id: "sample-1",
    name: "Mitti Ka Diya",
    category: "Diya & Lighting",
    description: "Traditional earthen diya.",
    price: 10,
    stock: 100,
    unit: "piece",
    image_url: "",
    video_url: "",
    active: true,
  },
  {
    id: "sample-2",
    name: "Colourful Diya",
    category: "Diya & Lighting",
    description: "Decorative festive diya.",
    price: 25,
    stock: 40,
    unit: "piece",
    image_url: "",
    video_url: "",
    active: true,
  },
  {
    id: "sample-3",
    name: "Lakshmi Ganesh Murti",
    category: "Idols & Murtis",
    description: "Festive pooja murti set.",
    price: 180,
    stock: 18,
    unit: "set",
    image_url: "",
    video_url: "",
    active: true,
  },
];

const categoryMeta: Record<
  string,
  { icon: string; colour: string }
> = {
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

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value =
        character === "x" ? random : (random & 3) | 8;

      return value.toString(16);
    },
  );
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  // Load actual products from Supabase.
  useEffect(() => {
    const client = supabase;

    if (!client) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProducts(
      db: NonNullable<typeof supabase>,
    ) {
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

  // Restore the shopping cart.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("shagunwala-cart-v1");

      if (saved) {
        setCart(JSON.parse(saved) as Record<string, number>);
      }
    } catch {
      // Ignore invalid browser storage.
    }
  }, []);

  // Save cart changes.
  useEffect(() => {
    try {
      localStorage.setItem(
        "shagunwala-cart-v1",
        JSON.stringify(cart),
      );
    } catch {
      // Storage is optional.
    }
  }, [cart]);

  const categories = useMemo(
    () => [
      "All products",
      ...Array.from(
        new Set(products.map((product) => product.category)),
      ).sort(),
    ],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const search = query.toLowerCase().trim();

    return products.filter((product) => {
      const searchable =
        `${product.name} ${product.category} ${product.description}`
          .toLowerCase();

      return (
        searchable.includes(search) &&
        (category === "All products" ||
          product.category === category)
      );
    });
  }, [products, query, category]);

  const cartItems: CartItem[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({
          product: products.find((product) => product.id === id),
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
    (sum, item) =>
      sum + Number(item.product.price) * item.quantity,
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
    const stock = products.find(
      (product) => product.id === id,
    )?.stock ?? 0;

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
    setIdempotencyKey(createOrderKey());
  }

  function closeCheckout() {
    if (busy) return;

    setCheckoutOpen(false);
    setError("");
  }

  async function placeOrder(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    const normalizedPhone = normalizeIndianPhone(phoneInput);

    if (name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!normalizedPhone) {
      setError(
        "Enter a valid 10-digit Indian mobile number without a leading zero.",
      );
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
      setError("The order service is not configured.");
      return;
    }

    if (!idempotencyKey) {
      setError("Please close checkout and try again.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: normalizedPhone,
          address: address.trim(),
          items: cartItems.map(({ product, quantity }) => ({
            product_id: product.id,
            quantity,
          })),
          idempotency_key: idempotencyKey,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          result.error ||
            "Order could not be submitted. Please try again.",
        );
        return;
      }

      setOrderId(String(result.orderId || ""));
      setCart({});
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
            ✧ FESTIVE FINDS, THOUGHTFULLY PICKED
          </span>
          <h1>
            Little things.
            <br />
            <em>Beautiful traditions.</em>
          </h1>
          <p>
            From glowing diyas to pooja murtis and festive
            decorations, find essentials for every celebration.
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
            <span className="eyebrow">FESTIVE FAVOURITES</span>
            <h2>Shop by collection</h2>
          </div>
          <a href="#products" className="text-link">
            Browse all products →
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
                <small>Explore collection ↗</small>
              </button>
            ))}
        </div>
      </section>

      <section id="products" className="section products-section">
        <div className="section-heading product-heading">
          <div>
            <span className="eyebrow">POOJA & FESTIVE ESSENTIALS</span>
            <h2>Festive essentials</h2>
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

        {loadError && (
          <div className="form-error inline-error">{loadError}</div>
        )}

        {loading ? (
          <div className="loading-state">Loading products…</div>
        ) : visibleProducts.length > 0 ? (
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const meta = categoryMeta[product.category] || {
                icon: "🎁",
                colour: "cream",
              };

              const quantity = cart[product.id] || 0;

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
                    <p>{product.description}</p>

                    <div className="product-bottom">
                      <div>
                        <strong>{money(Number(product.price))}</strong>
                        <small>per {product.unit || "piece"}</small>
                      </div>
                      <button
                        className="add-button"
                        onClick={() => add(product)}
                        disabled={
                          product.stock <= 0 ||
                          quantity >= product.stock
                        }
                      >
                        {product.stock <= 0
                          ? "Unavailable"
                          : quantity > 0
                            ? `Added (${quantity}) +`
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
            <h3>No products found</h3>
            <p>Try another search or category.</p>
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
          <span className="eyebrow">A SHOP CLOSE TO HOME</span>
          <h2>
            Traditions deserve
            <br />
            <em>the little details.</em>
          </h2>
          <p>
            Browse pooja essentials, festive decorations and gifts.
            Our shop will confirm your order before dispatch.
          </p>
        </div>
      </section>

      <section className="contact-band">
        <div>
          <span className="eyebrow">NEED A HAND?</span>
          <h2>Not sure what you need?</h2>
          <p>Contact the shop to confirm availability.</p>
        </div>
        <a href="#products" className="button button-light">
          Explore products →
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
                <h2>Your bag ({cartCount})</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
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
                  Final availability and delivery charges, if any, will
                  be confirmed by the shop.
                </p>

                <button
                  className="button button-primary full-width"
                  onClick={openCheckout}
                >
                  Continue to checkout →
                </button>
              </>
            ) : (
              <div className="empty-cart">
                <h3>Your bag is empty</h3>
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
                <h2 id="checkout-title">
                  {orderId ? "Order received" : "Place your order"}
                </h2>
              </div>
              <button
                className="close-button"
                onClick={closeCheckout}
                aria-label="Close checkout"
              >
                ×
              </button>
            </div>

            {orderId ? (
              <div className="success-state">
                <span className="success-icon">✓</span>
                <h3>Order request received!</h3>
                <p>
                  Your reference is{" "}
                  <strong>{orderId.slice(0, 8).toUpperCase()}</strong>.
                  The shop will contact you to confirm availability.
                </p>
                <div className="success-summary">
                  <span>Status</span>
                  <strong>Pending confirmation</strong>
                </div>
                <button
                  className="button button-primary full-width"
                  onClick={closeCheckout}
                >
                  Continue shopping
                </button>
              </div>
            ) : (
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
                    <span>IN +91</span>
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
                    placeholder="House, street, area, city, state and PIN code"
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

                <button
                  className="button button-primary full-width"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Submitting order…" : "Place order"} →
                </button>

                <p className="tiny-note">
                  No SMS OTP, CAPTCHA or online payment is needed.
                  Your order stays pending until the shop confirms it
                  by phone or WhatsApp.
                </p>

                {error && <p className="form-error">{error}</p>}
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}