// app/api/subscribe/route.ts
import { NextResponse } from "next/server";

// Force Node runtime and no caching
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveIp(req: Request, bodyIp?: string) {
  const h = req.headers;
  return (
    (bodyIp || "").trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    h.get("x-vercel-proxy-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      telegram?: string;
      ip?: string;
      source?: string;
    };

    const email = (body.email || "").trim();
    const telegram = (body.telegram || "").trim();
    const ip = resolveIp(req, body.ip);
    const source = (body.source || "CryptoMainly Portal").trim();
    const timestamp = new Date().toISOString();

    // Payload with multiple key aliases (to match Sheets/App Script mappings)
    const payload: Record<string, string> = {
      Email: email,
      Telegram: telegram,
      Source: source,
      source,
      IP: ip,
      ip,
      Timestamp: timestamp,
    };

    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

    if (scriptUrl) {
      // Fire-and-forget — DO NOT block UX no matter what
      fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify(payload),
        redirect: "follow",
      }).then(r => r.text().catch(() => "")).catch(() => {});
    }

    // ALWAYS return success to the client
    return NextResponse.json(
      { success: true, ok: true, message: "Success / Subscribed" },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch {
    // STILL return success — never surface an error
    return NextResponse.json(
      { success: true, ok: true, message: "Success / Subscribed" },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }
}
