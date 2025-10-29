// app/api/metrics/binance/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";  // no static caching
export const revalidate = 0;

// Binance public endpoints (no API key required)
const OI = (s: string) =>
  `https://fapi.binance.com/futures/data/openInterestHist?symbol=${s}&period=5m&limit=2`;
const FR = (s: string) =>
  `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${s}&limit=2`;
const LS = (s: string) =>
  `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${s}&period=5m&limit=2`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const metric = (searchParams.get("metric") || "oi").toLowerCase();

  let url = "";
  if (metric === "oi") url = OI(symbol);
  else if (metric === "fr") url = FR(symbol);
  else if (metric === "ls") url = LS(symbol);
  else {
    return NextResponse.json({ ok: false, error: "invalid metric" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const j = await res.json();

    if (!Array.isArray(j) || j.length === 0) {
      return NextResponse.json({ ok: false, error: "no data" }, { status: 200 });
    }

    // Take the latest snapshot and the previous one for arrow/colour logic
    const curr = j[j.length - 1];
    const prev = j.length > 1 ? j[j.length - 2] : null;

    let currVal: number | null = null;
    let prevVal: number | null = null;

    if (metric === "oi") {
      // sumOpenInterestValue is in USD; convert to billions for compact display
      currVal = curr?.sumOpenInterestValue ? Number(curr.sumOpenInterestValue) / 1e9 : null;
      prevVal = prev?.sumOpenInterestValue ? Number(prev.sumOpenInterestValue) / 1e9 : null;
    } else if (metric === "fr") {
      // fundingRate is a decimal (e.g., 0.0001 = 0.01%)
      currVal = curr?.fundingRate != null ? Number(curr.fundingRate) : null;
      prevVal = prev?.fundingRate != null ? Number(prev.fundingRate) : null;
    } else if (metric === "ls") {
      // longShortRatio is a numeric ratio (e.g., 1.12)
      currVal = curr?.longShortRatio != null ? Number(curr.longShortRatio) : null;
      prevVal = prev?.longShortRatio != null ? Number(prev.longShortRatio) : null;
    }

    return NextResponse.json(
      { ok: true, metric, symbol, curr: currVal, prev: prevVal, ts: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
