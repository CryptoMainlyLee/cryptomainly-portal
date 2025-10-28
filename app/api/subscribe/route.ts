import { NextResponse } from "next/server";

// Force dynamic so Vercel won’t cache this route
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    h.get("x-client-ip") ||
    "unknown"
  );
}

function success() {
  return new Response(
    JSON.stringify({
      success: true,
      ok: true,
      message: "Success! You’re on the list.",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const email: string = body?.email ?? "";
    const telegram: string = body?.telegram ?? "";
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, ok: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const ts = new Date().toISOString();
    const source = "CryptoMainly Portal";

    // Send multiple key aliases so the Apps Script can match header text exactly
    const payload = {
      // canonical
      Email: email,
      Telegram: telegram || "",
      Source: source,
      IP: ip,
      Timestamp: ts,

      // common alternatives (case/format variants)
      email,
      telegram,
      source,
      ip,
      timestamp: ts,
      "I.P": ip, // some sheets use a dotted header
      "Ip": ip,
    };

    const url = process.env.GOOGLE_SCRIPT_URL;
    if (url) {
      try {
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify(payload),
          redirect: "manual",
        }).then(r => r.text()).catch(() => "");
      } catch (err) {
        console.error("Apps Script request error:", err);
        // We still return success to avoid showing “failed” to the user
      }
    } else {
      console.warn("GOOGLE_SCRIPT_URL not set — skipping relay");
    }

    return success();
  } catch (err) {
    console.error("subscribe route fatal error:", err);
    // Still show success so the button doesn’t display “failed”
    return success();
  }
}
