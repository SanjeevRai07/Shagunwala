import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const access = await isAdmin(supabase);
  if (!access.ok) return NextResponse.json({ error: "Admin access required." }, { status: access.user ? 403 : 401 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : null;
  if (!['confirmed', 'cancelled', 'rejected'].includes(String(status))) return NextResponse.json({ error: "Invalid order status." }, { status: 400 });
  const { data, error } = await supabase.rpc("admin_set_order_status", { p_order_id: id, p_status: status });
  if (error) return NextResponse.json({ error: error.message || "Could not update order status." }, { status: 400 });
  return NextResponse.json({ orderId: data, status });
}
