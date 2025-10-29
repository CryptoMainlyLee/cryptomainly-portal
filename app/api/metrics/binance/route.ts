// app/api/metrics/binance/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";           // don't cache at the edge
export const revalidate = 30;                     // server cache ~30s

type Metric = "oi" | "funding" | "lsr";

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function serverError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

async function fetchJSON<T>(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      // Binance asks for a UA; harmless to set one
      headers: { "User-Agent": "cryptomainly-metrics/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Upstream ${res.status}`);
    }
    const json = (await res.json()) as T;
    return json;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    const metric = (searchParams.get("metric") || "").toLowerCase() as Metric;

    if (!symbol) return badRequest("Missing ?symbol (e.g. BTCUSDT)");
    if (!["oi", "funding", "lsr"].includes(metric))
      return badRequest("Invalid ?metric (use: oi | funding | lsr)");

    const base = "https://fapi.binance.com";

    if (metric === "oi") {
      // Open Interest (quantity) – /fapi/v1/openInterest
      type OIRes = { openInterest: string; symbol: string };
      const data = await fetchJSON<OIRes>(`${base}/fapi/v1/openInterest?symbol=${symbol}`);
      const value = Number(data.openInterest); // contracts
      return NextResponse.json({ ok: true, value, source: "binance" });
    }

    if (metric === "funding") {
      // Most-recent funding rate – /fapi/v1/fundingRate?limit=1
      type FR = { fundingRate: string; fundingTime: number };
      const arr = await fetchJSON<FR[]>(
        `${base}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`
      );
      if (!arr?.length) throw new Error("No funding data");
      const value = Number(arr[0].fundingRate); // decimal (e.g. 0.0001 = 0.01%)
      return NextResponse.json({ ok: true, value, source: "binance" });
    }

    // metric === "lsr"
    {
      // Global long/short ratio (accounts) – /futures/data/globalLongShortAccountRatio
      type LSR = { longShortRatio: string };
      const arr = await fetchJSON<LSR[]>(
        `${base}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`
      );
      if (!arr?.length) throw new Error("No LSR data");
      const ratio = Number(arr[0].longShortRatio); // e.g. 1.12 means 1.12:1 longs/shorts
      return NextResponse.json({ ok: true, value: ratio, source: "binance" });
    }
  } catch (err: any) {
    return serverError(String(err?.message || err));
  }
}
