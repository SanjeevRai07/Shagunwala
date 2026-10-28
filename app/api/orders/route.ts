import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeIndianPhone } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(
      request.headers.get("content-length") || 0,
    );

    if (contentLength > 32_000) {
      return NextResponse.json(
        { error: "Order request is too large." },
        { status: 413 },
      );
    }

    const db = createServiceClient();

    if (!db) {
      return NextResponse.json(
        { error: "Order service is not configured." },
        { status: 503 },
      );
    }

    const salt = process.env.ORDER_RATE_LIMIT_SALT;

    if (!salt) {
      return NextResponse.json(
        { error: "Order service security is not configured." },
        { status: 503 },
      );
    }

    const rawBody = await request.text();

    if (rawBody.length > 32_000) {
      return NextResponse.json(
        { error: "Order request is too large." },
        { status: 413 },
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid request format." },
        { status: 400 },
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return NextResponse.json(
        { error: "Invalid order details." },
        { status: 400 },
      );
    }

    const body = parsed as Record<string, unknown>;

    const customerName = cleanText(body.customer_name, 100);
    const customerPhone = normalizeIndianPhone(
      typeof body.customer_phone === "string"
        ? body.customer_phone
        : "",
    );
    const address = cleanText(body.address, 800);
    const idempotencyKey = cleanText(body.idempotency_key, 80);

    if (customerName.length < 2) {
      return NextResponse.json(
        { error: "Please enter your full name." },
        { status: 400 },
      );
    }

    if (!customerPhone) {
      return NextResponse.json(
        { error: "Enter a valid 10-digit Indian mobile number." },
        { status: 400 },
      );
    }

    if (address.length < 10) {
      return NextResponse.json(
        { error: "Please enter your complete delivery address." },
        { status: 400 },
      );
    }

    const validUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!validUuid.test(idempotencyKey)) {
      return NextResponse.json(
        { error: "Please reopen checkout and try again." },
        { status: 400 },
      );
    }

    if (
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > 20
    ) {
      return NextResponse.json(
        { error: "Your cart is empty or invalid." },
        { status: 400 },
      );
    }

    const items: {
      product_id: string;
      quantity: number;
    }[] = [];

    for (const entry of body.items) {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry)
      ) {
        return NextResponse.json(
          { error: "Invalid cart item." },
          { status: 400 },
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
          { status: 400 },
        );
      }

      items.push({
        product_id: productId,
        quantity,
      });
    }

    const remoteIp =
      request.headers.get("x-real-ip") ||
      request.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        .trim() ||
      "unknown";

    const ipHash = createHash("sha256")
      .update(`${salt}:${remoteIp}`)
      .digest("hex");

    // No OTP or CAPTCHA.
    // The database still checks prices, stock and order limits.
    const { data: orderId, error } = await db.rpc(
      "create_guest_customer_order",
      {
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_address: address,
        p_items: items,
        p_idempotency_key: idempotencyKey,
        p_ip_hash: ipHash,
      },
    );

    if (error) {
      console.error("Order database error:", error.message);

      const databaseMessage = error.message || "";
      const rateLimited = /too many|wait 10 minutes|rate limit/i.test(
        databaseMessage,
      );
      const stockError = /stock|not available|insufficient/i.test(
        databaseMessage,
      );

      return NextResponse.json(
        {
          error: rateLimited
            ? "Too many orders. Please wait a little and try again."
            : stockError
              ? "A product is unavailable or the stock has changed."
              : "The order could not be saved. Please try again.",
        },
        { status: rateLimited ? 429 : stockError ? 409 : 400 },
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
      },
    );
  } catch (error) {
    console.error("Order submission error:", error);

    return NextResponse.json(
      { error: "Unable to submit your order. Please try again." },
      { status: 500 },
    );
  }
}