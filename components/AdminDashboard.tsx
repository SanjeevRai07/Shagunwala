"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";

type Product = { id: string; name: string; category: string; description: string; price: number; stock: number; unit: string; image_url: string; video_url: string; active: boolean; created_at?: string };
type Item = { id: string; product_id: string; product_name: string; unit: string; quantity: number; unit_price: number; line_total: number };
type Order = { id: string; customer_name: string; customer_phone: string; address: string; total: number; status: string; created_at: string; order_items: Item[] };
type ProductForm = { name: string; category: string; description: string; price: string; stock: string; unit: string; image_url: string; video_url: string; active: boolean };
const emptyForm: ProductForm = { name: "", category: "Diya & Lighting", description: "", price: "", stock: "0", unit: "piece", image_url: "", video_url: "", active: true };
const categories = ["Diya & Lighting", "Idols & Murtis", "Pooja Essentials", "Garlands & Decor", "Stickers & Rangoli", "Cloth & Aasan", "Brooms", "Other"];
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const niceStatus = (status: string) => ({ pending_confirmation: "Pending confirmation", confirmed: "Confirmed", cancelled: "Cancelled", rejected: "Rejected" }[status] || status);

export default function AdminDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [qrData, setQrData] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    const [productResponse, orderResponse] = await Promise.all([
      fetch("/api/admin/products", { cache: "no-store" }),
      fetch("/api/admin/orders", { cache: "no-store" }),
    ]);
    if (productResponse.status === 401 || productResponse.status === 403) { router.replace("/admin/login"); return; }
    const productResult = await productResponse.json().catch(() => ({}));
    const orderResult = await orderResponse.json().catch(() => ({}));
    if (!productResponse.ok) setError(productResult.error || "Products could not load.");
    else setProducts(productResult.products ?? []);
    if (orderResponse.ok) setOrders(orderResult.orders ?? []);
    else if (orderResponse.status !== 401) setError(orderResult.error || "Orders could not load.");
    setLoading(false);
  }, [router]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function logout() {
    await supabase?.auth.signOut();
    router.replace("/admin/login"); router.refresh();
  }

  function startAdd() { setEditingId(null); setForm(emptyForm); setImageFile(null); setVideoFile(null); setFormOpen(true); setError(""); setSuccess(""); }
  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({ name: product.name, category: product.category, description: product.description || "", price: String(product.price), stock: String(product.stock), unit: product.unit || "piece", image_url: product.image_url || "", video_url: product.video_url || "", active: product.active });
    setImageFile(null); setVideoFile(null); setFormOpen(true); setError(""); setSuccess("");
  }
  function setField<K extends keyof ProductForm>(key: K, value: ProductForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function uploadMedia(file: File, bucket: "product-media" | "product-videos") {
    if (!supabase) throw new Error("Supabase is not configured.");
    const max = bucket === "product-media" ? 4 * 1024 * 1024 : 25 * 1024 * 1024;
    const allowed = bucket === "product-media" ? ["image/jpeg", "image/png", "image/webp", "image/gif"] : ["video/mp4", "video/webm", "video/quicktime"];
    if (file.size > max) throw new Error(bucket === "product-media" ? "Image must be 4 MB or smaller." : "Video must be 25 MB or smaller.");
    if (!allowed.includes(file.type)) throw new Error(bucket === "product-media" ? "Use JPG, PNG, WEBP or GIF images." : "Use MP4, WEBM or MOV video.");
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(-90);
    const path = `${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); setBusy(true);
    try {
      let imageUrl = form.image_url.trim(); let videoUrl = form.video_url.trim();
      if (imageFile) imageUrl = await uploadMedia(imageFile, "product-media");
      if (videoFile) videoUrl = await uploadMedia(videoFile, "product-videos");
      if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new Error("Product image URL must start with https://.");
      if (videoUrl && !/^https:\/\//i.test(videoUrl)) throw new Error("Product video URL must start with https://.");
      const body = { ...form, price: Number(form.price), stock: Number(form.stock), image_url: imageUrl, video_url: videoUrl };
      const response = await fetch(editingId ? `/api/admin/products/${editingId}` : "/api/admin/products", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save product.");
      setFormOpen(false); setEditingId(null); setSuccess(editingId ? "Product updated." : "Product added."); await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save product."); }
    finally { setBusy(false); }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete “${product.name}”? If it is linked to an order, the database may ask you to hide it instead.`)) return;
    setError(""); setSuccess("");
    const response = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setError(result.error || "Could not delete product. Try marking it unavailable instead.");
    setSuccess("Product deleted."); await loadData();
  }

  async function changeStatus(order: Order, status: "confirmed" | "cancelled" | "rejected") {
    const label = status === "confirmed" ? "confirm this order and reduce stock" : status === "cancelled" ? "cancel this order" : "reject this order";
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    setError(""); setSuccess("");
    const response = await fetch(`/api/admin/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setError(result.error || "Could not update order status.");
    setSuccess(`Order ${order.id.slice(0, 8).toUpperCase()} updated to ${niceStatus(status)}.`); await loadData();
  }

  async function createQr() {
    try { setQrData(await QRCode.toDataURL(window.location.origin, { width: 320, margin: 2, color: { dark: "#7d2627", light: "#ffffff" } })); }
    catch { setError("Could not generate QR code."); }
  }

  const filteredProducts = products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase().trim()));
  const pendingCount = orders.filter((o) => o.status === "pending_confirmation").length;
  const availableCount = products.filter((p) => p.active && Number(p.stock) > 0).length;
  const lowStockCount = products.filter((p) => p.active && Number(p.stock) > 0 && Number(p.stock) <= 5).length;

  return <main className="admin-page"><header className="site-header admin-topbar"><Link className="brand" href="/"><span className="brand-mark">🪔</span><span><strong>ShagunWala</strong><small>Shop dashboard</small></span></Link><div className="admin-top-actions"><Link className="text-link" href="/" target="_blank">View store ↗</Link><button className="button button-outline button-small" onClick={logout}>Sign out</button></div></header>
    <div className="admin-shell"><aside className="admin-sidebar"><span className="eyebrow">WORKSPACE</span><h2>Shop admin</h2><button className={`sidebar-tab ${tab === "products" ? "selected" : ""}`} onClick={() => setTab("products")}><span>▦</span> Products <b>{products.length}</b></button><button className={`sidebar-tab ${tab === "orders" ? "selected" : ""}`} onClick={() => setTab("orders")}><span>▤</span> Orders {pendingCount > 0 && <b className="pending-count">{pendingCount}</b>}</button><div className="sidebar-bottom"><div className="secure-card"><span>🔐</span><strong>Private admin</strong><small>Changes here update the live catalogue.</small></div><button className="sidebar-tab" onClick={createQr}><span>▦</span> Shop QR code</button></div></aside>
      <section className="admin-content"><div className="admin-page-title"><div><span className="eyebrow">YOUR STORE AT A GLANCE</span><h1>{tab === "products" ? "Products & stock" : "Customer orders"}</h1><p>{tab === "products" ? "Keep prices, photos and availability up to date." : "Review incoming orders and confirm them when ready."}</p></div>{tab === "products" && <button className="button button-primary" onClick={startAdd}>＋ Add product</button>}</div>
        <div className="stat-grid"><div className="stat-card"><span>Total products</span><strong>{products.length}</strong><small>Listed in catalogue</small></div><div className="stat-card"><span>In stock</span><strong>{availableCount}</strong><small>Available to customers</small></div><div className="stat-card"><span>Low stock</span><strong>{lowStockCount}</strong><small>Five or fewer left</small></div><div className="stat-card"><span>Pending orders</span><strong>{pendingCount}</strong><small>Need your review</small></div></div>
        {error && <p className="form-error admin-message">{error}</p>}{success && <p className="form-success admin-message">{success}</p>}
        {loading ? <div className="loading-state">Loading dashboard…</div> : tab === "products" ? <><div className="admin-toolbar"><label className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product…"/></label><span className="muted">{filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"}</span></div>{formOpen && <form className="product-editor" onSubmit={saveProduct}><div className="editor-heading"><div><span className="eyebrow">PRODUCT DETAILS</span><h2>{editingId ? "Edit product" : "Add a new product"}</h2></div><button type="button" className="close-button" onClick={() => setFormOpen(false)}>×</button></div><div className="editor-grid"><label>Product name<input value={form.name} onChange={(e) => setField("name", e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Colourful Diya"/></label><label>Category<select value={form.category} onChange={(e) => setField("category", e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label><label>Price (₹)<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setField("price", e.target.value)} required/></label><label>Stock quantity<input type="number" min="0" max="1000000" step="1" value={form.stock} onChange={(e) => setField("stock", e.target.value)} required/></label><label>Unit<select value={form.unit} onChange={(e) => setField("unit", e.target.value)}>{["piece", "pair", "pack", "set", "kg", "dozen"].map((u) => <option key={u}>{u}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)}/> Show in public catalogue</label><label className="full-field">Description<textarea value={form.description} onChange={(e) => setField("description", e.target.value)} maxLength={1500} rows={2} placeholder="A short description for customers"/></label><label className="full-field">Image URL (optional)<input type="url" value={form.image_url} onChange={(e) => setField("image_url", e.target.value)} placeholder="https://… or upload an image below"/><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}/><small className="field-help">JPG, PNG, WEBP or GIF · maximum 4 MB. Upload needs Supabase Storage setup.</small></label><label className="full-field">Video URL (optional)<input type="url" value={form.video_url} onChange={(e) => setField("video_url", e.target.value)} placeholder="https://…"/><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}/><small className="field-help">MP4, WEBM or MOV · maximum 25 MB. You can use a direct HTTPS video link too.</small></label></div><div className="editor-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Add product"}</button><button className="button button-outline" type="button" onClick={() => setFormOpen(false)}>Cancel</button></div></form>}
          <div className="admin-product-list">{filteredProducts.map((product) => <article className="admin-product-row" key={product.id}><div className="admin-product-thumb">{product.image_url ? <img src={product.image_url} alt=""/> : <span>{({"Diya & Lighting":"🪔","Idols & Murtis":"🛕","Pooja Essentials":"🙏","Garlands & Decor":"🌼","Stickers & Rangoli":"✨","Cloth & Aasan":"🧣",Brooms:"🧹"} as Record<string,string>)[product.category] || "🎁"}</span>}</div><div className="admin-product-info"><strong>{product.name}</strong><small>{product.category} · {money(Number(product.price))} / {product.unit}</small><div className="admin-row-meta"><span className={product.active ? "status-active" : "status-inactive"}>{product.active ? "Visible" : "Hidden"}</span><span className={Number(product.stock) <= 0 ? "stock-text out" : Number(product.stock) <= 5 ? "stock-text low" : "stock-text"}>{Number(product.stock) <= 0 ? "Out of stock" : `${product.stock} ${product.unit} in stock`}</span></div></div><div className="admin-row-actions"><button className="button button-outline button-small" onClick={() => startEdit(product)}>Edit</button><button className="button button-danger button-small" onClick={() => void deleteProduct(product)}>Delete</button></div></article>)}{!filteredProducts.length && <div className="empty-state"><span>✧</span><h3>No products found</h3><p>Add a product or change your search.</p></div>}</div></> : <div className="orders-list">{orders.map((order) => <article className="order-card" key={order.id}><div className="order-card-head"><div><span className="order-number">ORDER #{order.id.slice(0, 8).toUpperCase()}</span><h3>{order.customer_name}</h3><a className="order-phone" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a></div><span className={`order-status status-${order.status}`}>{niceStatus(order.status)}</span></div><div className="order-details"><p><span>Delivery address</span>{order.address}</p><p><span>Placed on</span>{new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="order-lines">{(order.order_items || []).map((item) => <div key={item.id}><span>{item.product_name} × {item.quantity} {item.unit}</span><strong>{money(Number(item.line_total))}</strong></div>)}</div><div className="order-card-bottom"><div><small>Order total</small><strong>{money(Number(order.total))}</strong></div><div className="order-actions">{order.status === "pending_confirmation" && <><button className="button button-primary button-small" onClick={() => void changeStatus(order, "confirmed")}>Confirm order</button><button className="button button-danger button-small" onClick={() => void changeStatus(order, "rejected")}>Reject</button></>}{order.status === "confirmed" && <button className="button button-outline button-small" onClick={() => void changeStatus(order, "cancelled")}>Cancel order</button>}</div></div></article>)}{!orders.length && <div className="empty-state"><span>✧</span><h3>No orders yet</h3><p>Verified customer orders will appear here.</p></div>}</div>}
      </section></div>
    {qrData && <div className="modal-backdrop" onClick={() => setQrData("")}><section className="qr-modal" onClick={(e) => e.stopPropagation()}><button className="close-button qr-close" onClick={() => setQrData("")}>×</button><span className="eyebrow">SCAN TO VISIT THE STORE</span><h2>ShagunWala QR code</h2><p>Print this QR code only after deploying the website to your final domain.</p><img src={qrData} alt="ShagunWala store QR code"/><strong>{typeof window !== "undefined" ? window.location.origin : ""}</strong><a href={qrData} download="shagunwala-qr.png" className="button button-primary full-width">Download QR image</a></section></div>}
  </main>;
}
