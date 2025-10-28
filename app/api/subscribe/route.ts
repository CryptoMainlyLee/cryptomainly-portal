// app/api/subscribe/route.ts
import { NextResponse } from "next/server";

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export async function POST(req: Request) {
  try {
    // 1) Parse body
    const { email, telegram } = await req.json();

    // 2) Validate email
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // 3) Prepare payload
    const source = "CryptoMainly Portal";
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const url = process.env.GOOGLE_SCRIPT_URL;

    // If the env var is missing, don't fail the UX
    if (!url) {
      return NextResponse.json(
        {
          success: true,
          message: "Saved. (Google Script URL not set on server yet.)",
        },
        { status: 200 }
      );
    }

    // 4) Send to Google Apps Script
    // Apps Script often returns 200/302 or plain text. We treat 2xx/3xx as success.
    let okLike = false;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          email,
          telegram: typeof telegram === "string" ? telegram : "",
          source,
          ip,
          ts: Date.now(),
        }),
        // Don’t cache at the edge
        cache: "no-store",
      });

      okLike = res.status >= 200 && res.status < 400;
      // Even if not JSON, attempt to consume to avoid node warnings
      try {
        await res.text();
      } catch {}
    } catch {
      // Network hiccup: we’ll still return success to avoid blocking the user
      okLike = true;
    }

    if (okLike) {
      return NextResponse.json(
        { success: true, message: "Success! You’re on the list." },
        { status: 200 }
      );
    }

    // If Apps Script truly failed with 4xx/5xx, be soft about it
    return NextResponse.json(
      {
        success: true,
        message:
          "Received. If you don’t get a welcome email, please try again later.",
      },
      { status: 200 }
    );
  } catch (err) {
    // Bad payload / unexpected error: still keep UX smooth
    return NextResponse.json(
      {
        success: true,
        message:
          "Received. If you don’t get a welcome email, please try again later.",
      },
      { status: 200 }
    );
  }
}
