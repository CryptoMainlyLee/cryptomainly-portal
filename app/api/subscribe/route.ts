import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

// Always return success to the browser; do not block UX on Sheets write.
export async function POST(req: Request) {
  const ok = NextResponse.json({ success: true });

  try {
    // 1) Read JSON from client (email + optional telegram)
    const { email, telegram, source: clientSource } = await req.json();

    // 2) Derive IP robustly on Vercel via next/headers (works behind proxy/edge)
    const h = nextHeaders();
    const fwd = h.get("x-forwarded-for") || "";
    const ip =
      (fwd && fwd.split(",")[0].trim()) ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      "";

    // 3) Soft email check; still return success either way
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return ok;
    }

    // 4) Post to Google Apps Script (URL from env var)
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL || "";
    if (!scriptUrl) return ok;

    const payload = {
      email,
      telegram: typeof telegram === "string" ? telegram : "",
      // ✅ GUARANTEE these fields are sent (Sheet columns: Email | Telegram | Source | IP | Timestamp)
      source: clientSource && typeof clientSource === "string"
        ? clientSource
        : "CryptoMainly Portal",
      ip, // may be empty if headers don’t include an address, but the key is always present
    };

    // Best-effort relay; ignore response shape/redirects
    await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      keepalive: true,
    }).catch(() => { /* swallow network errors */ });

    return ok;
  } catch {
    return ok;
  }
}
