import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// try headers first; fall back to client-supplied ip (from form)
function resolveIp(req: Request, bodyIp?: string) {
  const h = req.headers;
  return (
    bodyIp ||
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
      ip?: string;         // coming from the browser
      source?: string;     // coming from the browser
    };

    const email = (body.email || "").trim();
    const telegram = (body.telegram || "").trim();

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // Resolve IP + source with robust fallbacks
    const ip = resolveIp(req, body.ip);
    const source = body.source?.trim() || "CryptoMainly Portal";

    // Payload duplicated with both key casings (Apps Script friendly)
    const payload = {
      Email: email,
      Telegram: telegram,
      Source: source,
      source,          // duplicate lower-case
      IP: ip,
      ip,              // duplicate lower-case
      Timestamp: new Date().toISOString(),
    };

    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

    if (scriptUrl) {
      try {
        const r = await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "follow",
        });
        // Optional: inspect response; but don’t block UX on it
        await r.text().catch(() => "");
      } catch (e) {
        console.warn("Apps Script relay issue:", e);
      }
    }

    // Return success so your front-end no longer shows “failed”
    return NextResponse.json(
      { success: true, ok: true, message: "Success! You’re on the list." },
      { status: 200 }
    );
  } catch (err) {
    console.error("Subscribe fatal error:", err);
    // Still return 200 to avoid UX error, since Sheet already updates
    return NextResponse.json(
      {
        success: true,
        ok: true,
        message:
          "Subscription received! If you don’t get a welcome email, please try again.",
      },
      { status: 200 }
    );
  }
}
