import { NextResponse } from "next/server";

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/XXXXXXX/exec"; // <-- your live script URL

export async function POST(request: Request) {
  try {
    const { email, telegram } = await request.json();
    const source = "CryptoMainly Portal";
    const ip =
      request.headers.get("x-forwarded-for") || "unknown";

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email is required" },
        { status: 400 }
      );
    }

    // ✅ Send data to Google Sheets
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, telegram, source, ip }),
      });

      if (!res.ok) throw new Error("Failed to send to Google Sheets");
    } catch (err) {
      console.error("Google Sheets Error:", err);
      return NextResponse.json(
        { success: false, message: "Failed to save to Google Sheets" },
        { status: 500 }
      );
    }

    // ✅ Return success message
    return NextResponse.json({
      success: true,
      message: "Success — welcome aboard!",
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
