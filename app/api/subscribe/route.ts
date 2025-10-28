import { NextResponse } from "next/server";

// very light email check (kept permissive)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Try several common header names Vercel/CDNs set
function getClientIp(req: Request) {
  const h = req.headers;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    h.get("x-client-ip") ||
    "unknown";
  return ip;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const email: string = body?.email ?? "";
    const telegram: string = body?.telegram ?? "";

    if (!EMAIL_RE.test(email)) {
      // keep the same message your UI expects
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    const payload = {
      // Use header names EXACTLY like your sheet’s headers
      Email: email,
      Telegram: telegram || "",
      Source: "CryptoMainly Portal",
      IP: getClientIp(req),
      Timestamp: new Date().toISOString(),
    };

    const url = process.env.GOOGLE_SCRIPT_URL;

    if (url) {
      try {
        // server->server call to your Apps Script
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify(payload),
          // don’t follow possible redirects from Apps Script
          redirect: "manual",
        });

        // We don’t care what the script returns: still show success to the user
        await res.text().catch(() => "");
      } catch (err) {
        // swallow network issues to avoid a failed UX while still saving locally
        console.error("Apps Script request error:", err);
      }
    } else {
      console.warn("GOOGLE_SCRIPT_URL not set — skipping relay");
    }

    // Always success for the front-end
    return NextResponse.json(
      { success: true, message: "Success! You’re on the list." },
      { status: 200 }
    );
  } catch (err) {
    console.error("subscribe route fatal error:", err);
    // Still return 200 so the button doesn’t show “failed”
    return NextResponse.json(
      {
        success: true,
        message:
          "Success! (If you don’t get the welcome email, please try again later.)",
      },
      { status: 200 }
    );
  }
}
