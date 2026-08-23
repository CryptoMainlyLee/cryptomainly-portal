// app/api/subscribe/route.ts
import { NextResponse } from "next/server";

const EMAIL_RE =
  /^(?!\.)[A-Za-z0-9._%+-]+@(?!-)(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;

export async function POST(req: Request) {
  try {
    // 1) Parse + validate input
    const { email, telegram } = await req.json();

    const emailStr = (email ?? "").toString().trim();
    const telegramStr = (telegram ?? "").toString().trim();

    if (!EMAIL_RE.test(emailStr)) {
      return NextResponse.json(
        { ok: false, error: "invalid_email" },
        { status: 400 }
      );
    }

    // 2) Build source + best-effort IP for Vercel/proxies
    const source = "CryptoMainly Portal";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // 3) Relay to Google Apps Script and REQUIRE a successful HTTP response
    const url = process.env.GOOGLE_SCRIPT_URL;
    if (!url) {
      console.error("GOOGLE_SCRIPT_URL is not set");
      return NextResponse.json(
        { ok: false, error: "relay_not_configured" },
        { status: 500 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let googleResponse: Response;
    try {
      googleResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailStr,
          telegram: telegramStr,
          source,
          ip,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      console.error("Sheets relay request failed:", err);
      return NextResponse.json(
        { ok: false, error: "relay_unreachable" },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeout);
    }

    // Read the response so failures are useful in Vercel logs.
    const googleBody = await googleResponse.text().catch(() => "");

    if (!googleResponse.ok) {
      console.error("Sheets relay rejected request:", {
        status: googleResponse.status,
        statusText: googleResponse.statusText,
        body: googleBody.slice(0, 500),
      });

      return NextResponse.json(
        { ok: false, error: "relay_rejected" },
        { status: 502 }
      );
    }

    // 4) Only report success after Google has returned a successful status.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("subscribe route crash:", err);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
