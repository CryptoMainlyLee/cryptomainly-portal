import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, telegram } = await req.json();

    // basic validation
    const emailOk = typeof email === "string" && /\S+@\S+\.\S+/.test(email);
    if (!emailOk) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    const source = "CryptoMainly Portal";
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";

    const url = process.env.GOOGLE_SCRIPT_URL;
    if (!url) {
      console.error("GOOGLE_SCRIPT_URL is missing in env");
      return NextResponse.json(
        { success: false, message: "Server not configured (URL missing)." },
        { status: 500 }
      );
    }

    // send to Google Sheet
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, telegram, source, ip }),
      // No need for mode: 'no-cors' on server; we want the response body.
    });

    const text = await res.text(); // capture whatever the script returns
    if (!res.ok) {
      console.error("Google Sheets error:", res.status, text);
      return NextResponse.json(
        { success: false, message: "Could not save to Google Sheet." },
        { status: 502 }
      );
    }

    // If your script returns JSON, try parsing it (optional)
    // let payload: any = null;
    // try { payload = JSON.parse(text) } catch {}

    return NextResponse.json({
      success: true,
      message: "Success — welcome aboard!",
      // debug: payload ?? text, // (optional: remove after testing)
    });
  } catch (err) {
    console.error("Subscribe API fatal:", err);
    return NextResponse.json(
      { success: false, message: "Unexpected server error." },
      { status: 500 }
    );
  }
}
