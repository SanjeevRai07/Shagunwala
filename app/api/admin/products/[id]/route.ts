import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { validateProduct } from "@/lib/product-validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const access = await isAdmin(supabase);
  if (!access.ok) return NextResponse.json({ error: "Admin access required." }, { status: access.user ? 403 : 401 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = validateProduct(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabase.from("products").update(parsed.value).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: "Could not update product. Check the database setup and field values." }, { status: 400 });
  return NextResponse.json({ product: data }, { headers: { "Cache-Control": "no-store, private" } });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const access = await isAdmin(supabase);
  if (!access.ok) return NextResponse.json({ error: "Admin access required." }, { status: access.user ? 403 : 401 });
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "This product is linked to order history. Edit it and uncheck 'Show in public catalogue' instead of deleting it." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
