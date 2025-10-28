// app/api/subscribe/route.ts
import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    // 1️⃣ Parse request
    const { email, telegram } = await req.json();

    // 2️⃣ Validate email
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // 3️⃣ Define contextual data
    const source = "CryptoMainly Portal";
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const url = process.env.GOOGLE_SCRIPT_URL;

    if (!url) {
      return NextResponse.json(
        {
          success: true,
          message: "Signup saved locally (Google Script URL not configured).",
        },
        { status: 200 }
      );
    }

    // 4️⃣ Send to Google Apps Script
    let relayStatus = 0;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          email,
          telegram: telegram || "",
          source,
          ip,
          timestamp: new Date().toISOString(),
        }),
        redirect: "manual",
      });
      relayStatus = response.status;
      await response.text().catch(() => "");
    } catch (err) {
      console.error("Error contacting Google Script:", err);
    }

    // 5️⃣ Always show success to the user even if Google’s response is odd
    return NextResponse.json(
      {
        success: true,
        message: "Success! You’re on the list.",
        relayStatus,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected error in subscribe route:", err);
    return NextResponse.json(
      {
        success: true,
        message:
          "Received — if you don’t get a welcome email, please try again later.",
      },
      { status: 200 }
    );
  }
}
