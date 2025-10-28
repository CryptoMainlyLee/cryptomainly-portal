import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export async function POST(req: Request) {
  // Default response: success (we never show failure)
  let response = NextResponse.json({ success: true });

  try {
    const { email, telegram, source } = await req.json();

    // Try to gather IP from Vercel forward header
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";

    // Soft validation: only skip the network call if email is empty
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      // still return success to the client
      return response;
    }

    // Prefer env var if present; otherwise fall back to a hardcoded URL (optional)
    const url =
      process.env.GOOGLE_SCRIPT_URL ??
      ""; // keep empty if you only use the env var on Vercel

    if (!url) {
      // No URL configured in this environment — still succeed to the user
      return response;
    }

    // Best-effort relay to Google Apps Script
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Your Sheet expects Email, Telegram, Source, IP, Timestamp is added in Apps Script
      body: JSON.stringify({
        email,
        telegram: telegram ?? "",
        source: source ?? "CryptoMainly Portal",
        ip,
      }),
      // Avoid throwing the whole route on fetch aborts/timeouts
      cache: "no-store",
    }).catch(() => {
      /* ignore */
    });

    return response;
  } catch {
    // Never surface failure
    return response;
  }
}
