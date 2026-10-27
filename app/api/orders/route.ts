import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanText, normalizeIndianPhone } from "@/lib/validation";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const contentLength = Number(
    request.headers.get("content-length") || 0
  );

  if (contentLength > 32_000) {
    return NextResponse.json(
      { error: "Order request is too large." },
      { status: 413 }
    );
  }

  const db = createServiceClient();

  if (!db) {
    return NextResponse.json(
      { error: "Order service is not configured. Check .env.local." },
      { status: 503 }
    );
  }

  const salt = process.env.ORDER_RATE_LIMIT_SALT;

  if (!salt || salt === "PASTE_A_RANDOM_SECRET") {
    return NextResponse.json(
      { error: "Order security is not configured." },
      { status: 503 }
    );
  }

  let payload: Record<string, unknown>;

  try {
    const rawBody = await request.text();

    if (rawBody.length > 32_000) {
      return NextResponse.json(
        { error: "Order request is too large." },
        { status: 413 }
      );
    }

    const parsed: unknown = JSON.parse(rawBody);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Invalid order." },
        { status: 400 }
      );
    }

    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const customerName = cleanText(payload.customer_name, 100);
  const customerPhone = normalizeIndianPhone(
    typeof payload.customer_phone === "string"
      ? payload.customer_phone
      : ""
  );
  const address = cleanText(payload.address, 800);
  const idempotencyKey = cleanText(payload.idempotency_key, 80);
  const items = payload.items;

  if (customerName.length < 2) {
    return NextResponse.json(
      { error: "Please enter your full name." },
      { status: 400 }
    );
  }

  if (!customerPhone) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit Indian mobile number." },
      { status: 400 }
    );
  }

  if (address.length < 10) {
    return NextResponse.json(
      { error: "Please enter your complete delivery address." },
      { status: 400 }
    );
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idempotencyKey
    )
  ) {
    return NextResponse.json(
      { error: "Please restart checkout and try again." },
      { status: 400 }
    );
  }

  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    return NextResponse.json(
      { error: "Your cart must contain 1–20 product types." },
      { status: 400 }
    );
  }

  const sanitizedItems: { product_id: string; quantity: number }[] = [];

  for (const value of items) {
    if (!value || typeof value !== "object") {
      return NextResponse.json(
        { error: "Invalid cart item." },
        { status: 400 }
      );
    }

    const item = value as Record<string, unknown>;

    if (
      typeof item.product_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(item.product_id)
    ) {
      return NextResponse.json(
        { error: "Invalid product in cart." },
        { status: 400 }
      );
    }

    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return NextResponse.json(
        { error: "Quantity must be between 1 and 99." },
        { status: 400 }
      );
    }

    sanitizedItems.push({
      product_id: item.product_id,
      quantity,
    });
  }

  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const ipHash = createHash("sha256")
    .update(`${salt}:${remoteIp}`)
    .digest("hex");

  const captcha = await verifyTurnstile(
    typeof payload.captchaToken === "string"
      ? payload.captchaToken
      : undefined,
    remoteIp
  );

  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.message },
      { status: 400 }
    );
  }

  const { data: orderId, error } = await db.rpc(
    "create_guest_customer_order",
    {
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_address: address,
      p_items: sanitizedItems,
      p_idempotency_key: idempotencyKey,
      p_ip_hash: ipHash,
    }
  );

  if (error) {
    const message = error.message || "Your order could not be saved.";

    const status = /too many order|wait a few|limit/i.test(message)
      ? 429
      : /not available|not enough stock/i.test(message)
        ? 409
        : 400;

    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    {
      orderId,
      status: "pending_confirmation",
      message: "Your order request has been received.",
    },
    {
      status: 201,
      headers: { "Cache-Control": "no-store, private" },
    }
  );
}