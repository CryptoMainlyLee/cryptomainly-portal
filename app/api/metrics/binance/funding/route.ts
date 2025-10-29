// Funding rate (latest) with mirror fallback
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

    // fundingRate returns an array of records; we want the latest
    const path = `/futures/data/fundingRate?symbol=${symbol}&limit=1`;

    let data: any;
    try {
      data = await getJSON(`${PRIMARY}${path}`);
    } catch {
      data = await getJSON(`${MIRROR}${path}`);
    }

    // [{ fundingRate: "-0.0001", fundingTime: 1710000000000, ... }]
    const latest = Array.isArray(data) && data[0] ? data[0] : null;
    const value = latest ? Number(latest.fundingRate) : NaN;

    if (!isFinite(value)) {
      return NextResponse.json({ ok: false, error: "Upstream funding parse error" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, value, source: "binance" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 502 }
    );
  }
}
