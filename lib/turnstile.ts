export async function verifyTurnstile(token: string | undefined, remoteIp?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return { ok: true as const, skipped: true };
    return { ok: false as const, message: "Website security check is not configured. Please contact the shop administrator." };
  }
  if (!token || token.length > 2048) return { ok: false as const, message: "Please complete the security check." };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store",
    });
    if (!response.ok) return { ok: false as const, message: "Security verification could not be completed. Please try again." };
    const result = await response.json() as { success?: boolean; hostname?: string; "error-codes"?: string[] };
    if (!result.success) return { ok: false as const, message: "Security check expired or failed. Please try again." };
    const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (configuredUrl && result.hostname) {
      try {
        const expectedHost = new URL(configuredUrl).hostname;
        if (expectedHost !== "localhost" && expectedHost !== result.hostname) {
          return { ok: false as const, message: "Security hostname does not match the configured website." };
        }
      } catch { /* Ignore malformed optional site URL; deployment configuration should still be corrected. */ }
    }
    return { ok: true as const, skipped: false };
  } catch {
    return { ok: false as const, message: "Security verification is temporarily unavailable. Please try again." };
  }
}
