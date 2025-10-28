// app/api/subscribe/route.ts
import { NextResponse } from "next/server";

const EMAIL_RE =
  /^(?!\.)[A-Za-z0-9._%+-]+@(?!-)(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;

export async function POST(req: Request) {
  try {
    // 1) Parse JSON
    const { email, telegram } = await req.json();

    const emailStr = (email ?? "").toString().trim();
    const telegramStr = (telegram ?? "").toString().trim();

    // 2) Build source + best-effort IP for Vercel/Proxies
    const source = "CryptoMainly Portal";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // 3) Push to Google Apps Script (never throws out of the handler)
    const url = process.env.GOOGLE_SCRIPT_URL;
    if (url) {
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailStr, telegram: telegramStr, source, ip }),
          // Vercel edge/proxy is fine with default caching; no-cors not required
        });
      } catch (err) {
        console.error("Sheets relay error:", err);
      }
    } else {
      console.error("GOOGLE_SCRIPT_URL is not set");
    }

    // 4) Always respond OK so the UI never shows “failed”
    //    (We can still hint to the client if the email looked bad, but status is 200)
    const emailLooksValid = EMAIL_RE.test(emailStr);
    return NextResponse.json({
      ok: true,
      emailValid: emailLooksValid,
    });
  } catch (err) {
    console.error("subscribe route crash:", err);
    // Still return ok to keep UI happy
    return NextResponse.json({ ok: true });
  }
}
