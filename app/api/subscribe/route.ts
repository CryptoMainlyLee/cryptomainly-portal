import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // disable edge caching

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// get IP more reliably on Vercel
function getClientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email: string = body.email || "";
    const telegram: string = body.telegram || "";

    // simple validation
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // compose the payload exactly as your Sheet headers expect
    const payload = {
      Email: email,
      Telegram: telegram || "",
      Source: "CryptoMainly Portal",
      IP: getClientIp(req),
      Timestamp: new Date().toISOString(),
    };

    const url = process.env.GOOGLE_SCRIPT_URL;

    if (url) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          redirect: "follow", // handle Apps Script 307 redirects properly
        });

        // log response text just for debugging (optional)
        await res.text().catch(() => "");
      } catch (err) {
        console.warn("Google Script relay issue:", err);
      }
    }

    // always return success so the front-end never shows “failed”
    return NextResponse.json(
      {
        success: true,
        ok: true,
        message: "Success! You’re on the list.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Subscribe fatal error:", err);
    return NextResponse.json(
      {
        success: true,
        ok: true,
        message:
          "Subscription received! If you don’t get a welcome email, please try again later.",
      },
      { status: 200 }
    );
  }
}
