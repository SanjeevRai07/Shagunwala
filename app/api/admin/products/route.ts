import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { validateProduct } from "@/lib/product-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const access = await isAdmin(supabase);
  if (!access.ok) return NextResponse.json({ error: "Admin access required." }, { status: access.user ? 403 : 401 });
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load products." }, { status: 500 });
  return NextResponse.json({ products: data ?? [] }, { headers: { "Cache-Control": "no-store, private" } });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const access = await isAdmin(supabase);
  if (!access.ok) return NextResponse.json({ error: "Admin access required." }, { status: access.user ? 403 : 401 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = validateProduct(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabase.from("products").insert(parsed.value).select("*").single();
  if (error) return NextResponse.json({ error: error.message.includes("row-level security") ? "You do not have permission to add products." : "Could not add product. Check the database setup and field values." }, { status: 400 });
  return NextResponse.json({ product: data }, { status: 201 });
}

