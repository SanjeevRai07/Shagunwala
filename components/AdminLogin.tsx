"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminLogin() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!supabase) return setError("Supabase is not configured. Copy .env.example to .env.local and add your project keys.");
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) { setBusy(false); return setError("Login failed. Check your email and password."); }
    const response = await fetch("/api/admin/products", { cache: "no-store" });
    setBusy(false);
    if (!response.ok) {
      await supabase.auth.signOut();
      return setError(response.status === 403 ? "This account is not listed as a ShagunWala admin. Add it to public.admin_users in Supabase." : "Could not verify admin access. Check the database setup.");
    }
    router.push("/admin"); router.refresh();
  }

  return <main className="admin-auth-page"><header className="site-header admin-header"><Link className="brand" href="/"><span className="brand-mark">🪔</span><span><strong>ShagunWala</strong><small>Shop administration</small></span></Link><Link className="text-link" href="/">← Back to store</Link></header><section className="auth-card"><div className="auth-emblem">🔐</div><span className="eyebrow">PRIVATE SHOP MANAGEMENT</span><h1>Welcome back</h1><p>Sign in to manage products, stock and customer orders.</p><form className="checkout-form" onSubmit={login}><label>Admin email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourshop.com" required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your secure password" required/></label>{error && <p className="form-error">{error}</p>}<button className="button button-primary full-width" disabled={busy}>{busy ? "Signing in…" : "Sign in to admin"} <span>→</span></button></form><div className="auth-safety">🔒 Only users added to the admin access list can manage this shop.</div></section><footer className="site-footer simple-footer"><p>ShagunWala · Admin access</p></footer></main>;
}
