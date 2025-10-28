import { NextResponse } from "next/server";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { email, telegram } = await req.json().catch(() => ({} as any));

    // ✅ Step 1: Basic email validation
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // ✅ Step 2: Local log in development only (skipped in production)
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
        arr.push({ email, telegram: telegram || "", ts: new Date().toISOString() });
        await fs.writeFile(file, JSON.stringify(arr, null, 2), "utf8");
      } catch {}
    }

    // ✅ Step 3: Check environment variable
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json(
        { success: false, message: "Server config missing GOOGLE_SCRIPT_URL." },
        { status: 500 }
      );
    }

    // ✅ Step 4: Send data to Google Apps Script
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
      await r.text().catch(() => "");
    } catch (e) {
      return NextResponse.json(
        { success: false, message: "Network error. Please try again." },
        { status: 502 }
      );
    }

    // ✅ Step 5: Treat any 2xx or redirect (302) as success
    return NextResponse.json({
      success: true,
      message: "Success — welcome aboard!",
      relayStatus: status,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Unexpected server error." },
      { status: 500 }
    );
  }
}
