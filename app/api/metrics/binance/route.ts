// Minimal, targeted fix: route OI / Funding / LSR to Binance (public endpoints)
// so we avoid CoinGlass 451 blocks. Frontend contract unchanged.
//
// GET /api/metrics/binance?symbol=BTCUSDT&metric=oi|funding|lsr
//
// Returns { ok: true, value: number } on success,
// or { ok: false, error: string } on failure.

import { NextResponse } from "next/server";

type MetricKind = "oi" | "funding" | "lsr";

export async function GET(req: Request, { params }: { params: { exchange: string } }) {
  const url = new URL(req.url);
  const exchange = (params.exchange || "").toLowerCase();
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const metric = (url.searchParams.get("metric") || "").toLowerCase() as MetricKind;

  // Only handle our three Binance-backed metrics here
  if (exchange !== "binance") {
    return NextResponse.json({ ok: false, error: "Unknown exchange" }, { status: 400 });
  }
  if (!["oi", "funding", "lsr"].includes(metric)) {
    return NextResponse.json({ ok: false, error: "Unknown metric" }, { status: 400 });
  }

  try {
    let upstream: string;

    if (metric === "oi") {
      // Open Interest history (last candle)
      upstream = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=1`;
      const res = await fetch(upstream, { cache: "no-store" });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `Upstream OI error: ${res.status}` }, { status: 502 });
      }
      const data: Array<{ sumOpenInterest: string }> = await res.json();
      const last = data?.[data.length - 1];
      const value = last ? Number(last.sumOpenInterest) : NaN;
      if (!isFinite(value)) {
        return NextResponse.json({ ok: false, error: "Invalid OI response" }, { status: 502 });
      }
      return NextResponse.json({ ok: true, value }, { headers: { "Cache-Control": "no-store" } });
    }

    if (metric === "funding") {
      // Premium index includes latest funding rate
      upstream = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`;
      const res = await fetch(upstream, { cache: "no-store" });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `Upstream funding error: ${res.status}` }, { status: 502 });
      }
      const data: { lastFundingRate?: string } = await res.json();
      const value = Number(data.lastFundingRate ?? NaN);
      if (!isFinite(value)) {
        return NextResponse.json({ ok: false, error: "Invalid funding response" }, { status: 502 });
      }
      return NextResponse.json({ ok: true, value }, { headers: { "Cache-Control": "no-store" } });
    }

    // metric === "lsr"
    // Global Long/Short Account Ratio (last candle)
    upstream = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`;
    const res = await fetch(upstream, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Upstream LSR error: ${res.status}` }, { status: 502 });
    }
    const data: Array<{ longShortRatio: string }> = await res.json();
    const last = data?.[data.length - 1];
    const value = last ? Number(last.longShortRatio) : NaN;
    if (!isFinite(value)) {
      return NextResponse.json({ ok: false, error: "Invalid LSR response" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, value }, { headers: { "Cache-Control": "no-store" } });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
