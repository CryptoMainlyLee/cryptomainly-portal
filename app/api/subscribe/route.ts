// app/api/subscribe/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { email, telegram } = await req.json().catch(() => ({} as any));

    // Validate email
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // Best-effort dev log (no-op on Vercel)
    if (process.env.NODE_ENV !== "production") {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const dataDir = path.join(process.cwd(), "data");
        await fs.mkdir(dataDir, { recursive: true });
        const file = path.join(dataDir, "subscribers.json");
        let arr: any[] = [];
        try { arr = JSON.parse(await fs.readFile(file, "utf8")); } catch {}
        arr.push({ email, telegram: telegram || "", ts: new Date().toISOString() });
        await fs.writeFile(file, JSON.stringify(arr, null, 2), "utf8");
      } catch {}
    }

    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json(
        { success: false, message: "Server config missing GOOGLE_SCRIPT_URL." },
        { status: 500 }
      );
    }

    // Call Apps Script (its response type varies; we don’t rely on it)
    let status = 0;
    try {
      const r = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, telegram }),
        redirect: "manual",
        // @ts-ignore
        next: { revalidate: 0 },
      });
      status = r.status;
      // do not throw on non-2xx; Sheets already got the data if Apps Script accepted it
      await r.text().catch(() => "");
    } catch (e) {
      // transport error — this is the only time we truly fail
      return NextResponse.json(
        { success: false, message: "Network error. Please try again." },
        { status: 502 }
      );
    }

    // If we got here, we reached Apps Script. Treat as success regardless of exact status/body.
    return NextResponse.json({
      success: true,
      message: "Success — welcome aboard!",
      relayStatus: status, // helpful in logs; ignored by UI
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Unexpected server error." },
      { status: 500 }
    );
  }
}
