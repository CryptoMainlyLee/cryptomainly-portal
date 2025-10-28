import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

// Always return success to the browser; we don't block on Sheets.
export async function POST(req: Request) {
  // Show success to user no matter what.
  const ok = NextResponse.json({ success: true });

  try {
    // 1) Read JSON from client
    const { email, telegram, source: clientSource } = await req.json();

    // 2) Derive IP as robustly as possible on Vercel
    //    Using next/headers() is the most reliable way behind the edge/runtime.
    const h = nextHeaders();
    const fwd = h.get("x-forwarded-for") || "";
    const real = h.get("x-real-ip") || "";
    const cf = h.get("cf-connecting-ip") || "";
    const ip =
      (fwd && fwd.split(",")[0].trim()) ||
      real ||
      cf ||
      "";

    // 3) Soft email check; still return success to the user either way
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return ok;
    }

    // 4) Use Vercel env var for your Apps Script URL
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL ?? "";
    if (!scriptUrl) {
      // No URL configured in this environment — still succeed to the user
      return ok;
    }

    // 5) Relay to Google Sheets (best effort)
    const payload = {
      email,
      telegram: typeof telegram === "string" ? telegram : "",
      // GUARANTEE these fields are present
      source: clientSource && typeof clientSource === "string"
        ? clientSource
        : "CryptoMainly Portal",
      ip, // may be "", but field will always be present
    };

    await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      // don't throw the whole route on network issues
      keepalive: true,
    }).catch(() => { /* ignore */ });

    return ok;
  } catch {
    return ok;
  }
}
