// Global long/short account ratio (Binance)
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
    if (!symbol) return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });

    // 5m window is fine for the widget—return latest point
    const qs = `symbol=${symbol}&period=5m&limit=1`;
    const urls = [
      `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?${qs}`,
      `https://api.binance.com/futures/data/globalLongShortAccountRatio?${qs}`,
    ];

    let data: any = null;
    let lastErr: any = null;
    for (const u of urls) {
      try {
        const arr = await hit(u);
        data = Array.isArray(arr) && arr.length ? arr[0] : null;
        if (data) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!data) throw lastErr || new Error("No data");

    const value =
      typeof data.longShortRatio === "string" ? parseFloat(data.longShortRatio) : Number(data.longShortRatio);

    return NextResponse.json({ ok: true, value, source: "binance" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 502 });
  }
}
