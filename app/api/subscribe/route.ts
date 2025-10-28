// app/api/subscribe/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { email, telegram } = await req.json().catch(() => ({} as any));

    // Validate email early
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    const source = "CryptoMainly Portal";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // DEV-only local log (never errors if it fails)
    if (process.env.NODE_ENV !== "production") {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const dataDir = path.join(process.cwd(), "data");
        await fs.mkdir(dataDir, { recursive: true });
        const file = path.join(dataDir, "subscribers.json");
        let arr: any[] = [];
        try {
          arr = JSON.parse(await fs.readFile(file, "utf8"));
        } catch {}
        arr.push({ email, telegram: telegram || "", ip, source, ts: new Date().toISOString() });
        await fs.writeFile(file, JSON.stringify(arr, null, 2), "utf8");
      } catch {}
    }

    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json(
        { success: false, message: "Server missing GOOGLE_SCRIPT_URL." },
        { status: 500 }
      );
    }

    // Send to Apps Script
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, telegram, source, ip }),
      // @ts-ignore
      next: { revalidate: 0 },
      redirect: "manual", // we’ll treat 302 as success too
    });

    const status = res.status;

    // Try to read response safely (text or JSON)
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {}

    // SUCCESS if:
    // - 2xx (Apps Script usually returns 200 with text), OR
    // - 302 (some scripts issue a redirect after success)
    if ((status >= 200 && status < 300) || status === 302) {
      return NextResponse.json({
        success: true,
        message: "Success — welcome aboard!",
        // optional echo for debugging (not shown in UI)
        echo: bodyText?.slice(0, 200),
      });
    }

    // Anything else: bubble up a friendly error
    return NextResponse.json(
      {
        success: false,
        message: "Subscription failed. Please try again shortly.",
        status,
        details: bodyText?.slice(0, 200),
      },
      { status: 502 }
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, message: "Unexpected server error." },
      { status: 500 }
    );
  }
}
