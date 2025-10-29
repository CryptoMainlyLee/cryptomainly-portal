// Open interest (contracts) for a futures symbol
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function hit(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://www.cryptomainly.co.uk/" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol)
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });

    // ✅ Mirror + primary + fallback
    const urls = [
      `https://data-api.binance.vision/fapi/v1/openInterest?symbol=${symbol}`,
      `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
      `https://api.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
    ];

    let data: any = null;
    let lastErr: any = null;

    for (const u of urls) {
      try {
        data = await hit(u);
        if (data) break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!data) throw lastErr || new Error("No data");

    const value =
      typeof data.openInterest === "string"
        ? parseFloat(data.openInterest)
        : Number(data.openInterest);

    return NextResponse.json({ ok: true, value, source: "binance" });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 502 }
    );
  }
}
