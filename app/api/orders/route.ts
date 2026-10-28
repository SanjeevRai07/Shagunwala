import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  cleanText,
  normalizeIndianPhone,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const length = Number(
      request.headers.get("content-length") || 0
    );

    if (length > 32000) {
      return NextResponse.json(
        { error: "Order request is too large." },
        { status: 413 }
      );
    }

    const db = createServiceClient();

    if (!db) {
      return NextResponse.json(
        { error: "Order service is not configured." },
        { status: 503 }
      );
    }

    const salt = process.env.ORDER_RATE_LIMIT_SALT;

    if (!salt) {
      return NextResponse.json(
        { error: "Order security is not configured." },
        { status: 503 }
      );
    }

    const raw = await request.text();

    if (raw.length > 32000) {
      return NextResponse.json(
        { error: "Order request is too large." },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid order details." },
        { status: 400 }
      );
    }

    const p = body as Record<string, unknown>;

    const name = cleanText(p.customer_name, 100);
    const phone = normalizeIndianPhone(
      typeof p.customer_phone === "string"
        ? p.customer_phone
        : ""
    );
    const address = cleanText(p.address, 800);
    const key = cleanText(p.idempotency_key, 80);

    if (name.length < 2) {
      return NextResponse.json(
        { error: "Enter your full name." },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid Indian mobile number." },
        { status: 400 }
      );
    }

    if (address.length < 10) {
      return NextResponse.json(
        { error: "Enter your complete delivery address." },
        { status: 400 }
      );
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
    ) {
      return NextResponse.json(
        { error: "Please reopen checkout and try again." },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(p.items) ||
      p.items.length < 1 ||
      p.items.length > 20
    ) {
      return NextResponse.json(
        { error: "Your cart is empty or invalid." },
        { status: 400 }
      );
    }

    const items: { product_id: string; quantity: number }[] = [];

    for (const entry of p.items) {
      if (!entry || typeof entry !== "object") {
        return NextResponse.json(
          { error: "Invalid cart item." },
          { status: 400 }
        );
      }

      const item = entry as Record<string, unknown>;
      const productId = item.product_id;
      const quantity = Number(item.quantity);

      if (
        typeof productId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(productId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        return NextResponse.json(
          { error: "Invalid product or quantity." },
          { status: 400 }
        );
      }

      items.push({
        product_id: productId,
        quantity,
      });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    const ipHash = createHash("sha256")
      .update(`${salt}:${ip}`)
      .digest("hex");

    // No OTP and no CAPTCHA.
    // Database still validates stock, price and order limits.
    const { data: orderId, error } = await db.rpc(
      "create_guest_customer_order",
      {
        p_customer_name: name,
        p_customer_phone: phone,
        p_address: address,
        p_items: items,
        p_idempotency_key: key,
        p_ip_hash: ipHash,
      }
    );

    if (error) {
      const message = error.message || "Order could not be saved.";

      const status =
        /too many|wait 10 minutes|wait/i.test(message)
          ? 429
          : /stock|not available|insufficient/i.test(message)
            ? 409
            : 400;

      return NextResponse.json(
        { error: message },
        { status }
      );
    }

    return NextResponse.json(
      {
        orderId,
        status: "pending_confirmation",
        message: "Your order request has been received.",
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store, private",
        },
      }
    );
  } catch (error) {
    console.error("Order submission failed:", error);

    return NextResponse.json(
      { error: "Unable to place the order. Please try again." },
      { status: 500 }
    );
  }
}