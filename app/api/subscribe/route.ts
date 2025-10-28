// app/api/subscribe/route.ts
import { NextResponse } from "next/server";

const EMAIL_RE =
  /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export async function POST(req: Request) {
  try {
    // 1) Parse body once
    const { email, telegram } = await req.json();

    // 2) Basic validation
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // 3) Ensure env var is present
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
      console.error("Missing GOOGLE_SCRIPT_URL env var.");
      return NextResponse.json(
        {
          success: false,
          message:
            "Subscription temporarily unavailable (server not configured).",
        },
        { status: 500 }
      );
    }

    // 4) Build payload
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const payload = {
      email,
      telegram: typeof telegram === "string" ? telegram : "",
      source: "CryptoMainly Portal",
      ip,
      ts: new Date().toISOString(),
    };

    // 5) Send to Google Apps Script (your bound Sheet handler)
    const res = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive helps in edgey environments, harmless otherwise
      // @ts-ignore
      keepalive: true,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Apps Script responded non-200:", res.status, text);
      return NextResponse.json(
        { success: false, message: "Subscription failed." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Success — welcome aboard!" },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Subscribe API error:", err?.message || err);
    return NextResponse.json(
      { success: false, message: "Subscription failed." },
      { status: 500 }
    );
  }
}
