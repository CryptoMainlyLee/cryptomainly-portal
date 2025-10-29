// app/api/metrics/binance/route.ts
import { NextResponse } from "next/server";

type Metric = "oi" | "funding" | "lsr";

/** Map widget symbols ("BTCUSDT") to CoinGlass symbols ("BTC"). */
function normalizeSymbol(input?: string): string {
  const s = (input || "BTCUSDT").toUpperCase();
  // CoinGlass expects base coin only (BTC, ETH, etc.)
  const m = s.match(/^[A-Z]{2,5}/);
  return (m?.[0] ?? "BTC").replace("1000", ""); // safety for 1000PEPE-style
}

function toError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function cgFetch(path: string) {
  const key = process.env.COINGLASS_API_KEY;
  if (!key) throw new Error("Missing COINGLASS_API_KEY");

  const url = `https://open-api.coinglass.com${path}`;
  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      "coinglassSecret": key,
      // a UA helps avoid occasional upstream rejections
      "User-Agent": "cryptomainly-portal/1.0 (+https://www.cryptomainly.co.uk)"
    },
    // don’t cache at the edge; widget is small and live
    cache: "no-store",
  });

  if (!res.ok) {
    // Bubble a readable upstream error to help diagnose (incl. 451/403)
    const text = await res.text().catch(() => "");
    throw new Error(`CoinGlass HTTP ${res.status}${text ? `: ${text.slice(0, 140)}` : ""}`);
  }
  return res.json();
}

/** Extract a number from possibly-varied CoinGlass shapes. */
function pickNumber(...candidates: any[]): number | undefined {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

async function getOpenInterest(symbol: string) {
  // e.g. /api/futures/openInterest?symbol=BTC
  const j = await cgFetch(`/api/futures/openInterest?symbol=${symbol}`);
  // Common shapes:
  // { data: [{ exchangeName, openInterest, ...}, ...], ... }
  // Some responses also include totals.
  const arr: any[] = j?.data ?? [];
  if (Array.isArray(arr) && arr.length) {
    // Prefer Binance if present, else sum as total
    const binance = arr.find(x =>
      String(x?.exchangeName ?? x?.exchange ?? "").toLowerCase().includes("binance")
    );
    const binanceVal = pickNumber(binance?.openInterest, binance?.oi, binance?.value);
    if (binanceVal !== undefined) return binanceVal;

    // Fallback: sum across exchanges (USD notional)
    const sum = arr.reduce((acc, x) => {
      const v = pickNumber(x?.openInterest, x?.oi, x?.value);
      return acc + (v ?? 0);
    }, 0);
    if (Number.isFinite(sum) && sum > 0) return sum;
  }
  // As last resort try direct fields
  const total = pickNumber(j?.totalOpenInterest, j?.openInterest, j?.oi);
  if (total !== undefined) return total;

  throw new Error("Open Interest: no numeric value found");
}

async function getFunding(symbol: string) {
  // e.g. /api/futures/fundingRate?symbol=BTC
  const j = await cgFetch(`/api/futures/fundingRate?symbol=${symbol}`);
  // Common shapes:
  // { data: [{ exchangeName, fundingRate, ...}, ...] }
  const arr: any[] = j?.data ?? [];
  if (Array.isArray(arr) && arr.length) {
    const binance = arr.find(x =>
      String(x?.exchangeName ?? x?.exchange ?? "").toLowerCase().includes("binance")
    );
    const binanceVal = pickNumber(binance?.fundingRate, binance?.rate, binance?.value);
    if (binanceVal !== undefined) return binanceVal;

    // Fallback: average across exchanges
    const vals = arr
      .map(x => pickNumber(x?.fundingRate, x?.rate, x?.value))
      .filter((n): n is number => n !== undefined);
    if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  const direct = pickNumber(j?.fundingRate, j?.rate, j?.value);
  if (direct !== undefined) return direct;

  throw new Error("Funding Rate: no numeric value found");
}

async function getLongShort(symbol: string) {
  // e.g. /api/futures/longShortRate?symbol=BTC
  const j = await cgFetch(`/api/futures/longShortRate?symbol=${symbol}`);
  // Common shapes:
  // { data: [{ exchangeName, longShortRate, longRate, shortRate, ...}, ...] }
  const arr: any[] = j?.data ?? [];
  if (Array.isArray(arr) && arr.length) {
    const binance = arr.find(x =>
      String(x?.exchangeName ?? x?.exchange ?? "").toLowerCase().includes("binance")
    );
    // Prefer a single ratio if present
    const ratio = pickNumber(
      binance?.longShortRate,
      binance?.lsr,
      binance?.ratio,
      // else compute L/S if longs & shorts available
      (binance?.longRate && binance?.shortRate)
        ? Number(binance.longRate) / Number(binance.shortRate)
        : undefined
    );
    if (ratio !== undefined) return ratio;

    // Fallback: average ratio across exchanges that have both sides
    const ratios = arr.map(x => {
      const r1 = pickNumber(x?.longShortRate, x?.lsr, x?.ratio);
      if (r1 !== undefined) return r1;
      const longV = pickNumber(x?.longRate, x?.long);
      const shortV = pickNumber(x?.shortRate, x?.short);
      if (longV !== undefined && shortV) return longV / shortV;
      return undefined;
    }).filter((n): n is number => n !== undefined);

    if (ratios.length) return ratios.reduce((a, b) => a + b, 0) / ratios.length;
  }

  // Very last resort
  const direct = pickNumber(j?.longShortRate, j?.ratio, j?.lsr);
  if (direct !== undefined) return direct;

  throw new Error("Long/Short: no numeric value found");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // We keep your original query shape: /api/metrics/binance?metric=oi|funding|lsr&symbol=BTCUSDT
    const metric = (searchParams.get("metric") || "oi").toLowerCase() as Metric;
    const symbol = normalizeSymbol(searchParams.get("symbol") || "BTCUSDT");

    let value: number;
    if (metric === "oi") value = await getOpenInterest(symbol);
    else if (metric === "funding") value = await getFunding(symbol);
    else if (metric === "lsr") value = await getLongShort(symbol);
    else return toError("Unknown metric", 400);

    return NextResponse.json({
      ok: true,
      metric,
      symbol,
      value,
      src: "coinglass",
      // UI convenience: timestamp to help bust stale caches if needed
      ts: Date.now()
    }, { headers: { "Cache-Control": "no-store" } });

  } catch (err: any) {
    // Standardized error (so your widget shows gracefully)
    const msg = String(err?.message || err || "unknown error");
    // Surface upstream blocks like 451/403 clearly
    const status = /coin?glass http\s+(\d+)/i.test(msg) ? 502 : 500;
    return toError(`Upstream error: ${msg}`, status);
  }
}
