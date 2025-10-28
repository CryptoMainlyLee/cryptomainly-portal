// app/api/subscribe/route.ts
import { NextResponse } from "next/server";

// Use Node runtime (we may use fs locally during development only)
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    // Parse body safely
    const { email, telegram } = await req.json().catch(() => ({} as any));

    // Basic validation
    const emailOk = typeof email === "string" && EMAIL_RE.test(email);
    if (!emailOk) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email." },
        { status: 400 }
      );
    }

    // Meta for logging
    const source = "CryptoMainly Portal";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // ---- DEV-ONLY: write to local JSON (skipped on Vercel) ----
    if (process.env.NODE_ENV !== "production") {
      // Lazy import so it never bundles into edge
      const fs = await import("fs/promises");
      const path = await import("path");
      try {
        const dataDir = path.join(process.cwd(), "data");
        const file = path.join(dataDir, "subscribers.json");
        await fs.mkdir(dataDir, { recursive: true });

        let existing: any[] = [];
        try {
          const raw = await fs.readFile(file, "utf8");
          existing = JSON.parse(raw);
        } catch {
          existing = [];
        }

        existing.push({
          email,
          telegram: telegram || "",
          ip,
          source,
          ts: new Date().toISOString(),
        });

        await fs.writeFile(file, JSON.stringify(existing, null, 2), "utf8");
      } catch {
        // ignore local write errors in dev
      }
    }
    // -----------------------------------------------------------

    // Backend target (Google Apps Script) from environment
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Server not configured (missing GOOGLE_SCRIPT_URL). Please try again later.",
        },
        { status: 500 }
      );
    }

    // Forward to Google Apps Script
    const forward = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, telegram, source, ip }),
      // small timeout guard (Apps Script is usually very fast)
      // @ts-ignore
      next: { revalidate: 0 },
    });

    if (!forward.ok) {
      const text = await forward.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          message: "Subscription failed. Please try again shortly.",
          details: text?.slice(0, 200),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Success — welcome aboard!",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: "Unexpected server error." },
      { status: 500 }
    );
  }
}
