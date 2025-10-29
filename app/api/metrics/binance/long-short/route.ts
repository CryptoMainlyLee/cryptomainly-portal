// Global taker long/short ratio with mirror fallback
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PRIMARY = "https://fapi.binance.com";
const MIRROR  = "https://data-api.binance.vision";

async function getJSON(url: string) {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; CryptoMainlyBot/1.0)"
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();

    // takerlongshortRatio returns [{ longShortRatio: "2.34", ... }]
    // interval 5m, last 1
    const path = `/futures/data/takerlongshortRatio?symbol=${symbol}&period=5m&limit=1`;

    let data: any;
    try {
      data = await getJSON(`${PRIMARY}${path}`);
    } catch {
      data = await getJSON(`${MIRROR}${path}`);
    }

    const latest = Array.isArray(data) && data[0] ? data[0] : null;
    const ratio = latest ? Number(latest.longShortRatio) : NaN;

    if (!isFinite(ratio)) {
      return NextResponse.json({ ok: false, error: "Upstream long/short parse error" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, value: ratio, source: "binance" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 502 }
    );
  }
}
