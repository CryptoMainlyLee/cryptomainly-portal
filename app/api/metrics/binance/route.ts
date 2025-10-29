// app/api/metrics/binance/route.ts
import { NextResponse } from "next/server";

const BINANCE_FAPI = "https://fapi.binance.com";           // USDⓈ-M endpoints
const BINANCE_FUTURES = "https://fapi.binance.com";        // alias for clarity

// Small helper to standardize OK/ERR responses
function ok(data: any) {
  return NextResponse.json({ ok: true, ...data }, { status: 200 });
}
function err(message: string, code = 502) {
  return NextResponse.json({ ok: false, error: message }, { status: code });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
    const metric = (url.searchParams.get("metric") || "").toLowerCase();

    if (!["oi", "fr", "lsr"].includes(metric)) {
      return err("Unsupported metric. Use one of: oi, fr, lsr", 400);
    }

    // Abort if Binance is slow
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 7000);

    switch (metric) {
      case "oi": {
        // Open Interest (we’ll request the latest 5m bucket and read sumOpenInterestValue in USD)
        const resp = await fetch(
          `${BINANCE_FUTURES}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=1`,
          { signal: ctrl.signal, headers: { "User-Agent": "cryptomainly-portal" } }
        );
        clearTimeout(tm);
        if (!resp.ok) return err(`Upstream OI error: ${resp.status}`);
        const arr = (await resp.json()) as Array<{
          symbol: string;
          sumOpenInterest: string;
          sumOpenInterestValue: string; // USD value
          timestamp: number;
        }>;
        if (!arr?.length) return err("No OI data");
        const latest = arr[0];
        // Return billions for compact UI (e.g. 10.23 B)
        const usd = Number(latest.sumOpenInterestValue || "0");
        return ok({
          metric: "oi",
          value: usd,
          formatted: `${(usd / 1e9).toFixed(2)} B`,
          ts: latest.timestamp,
          source: "binance",
        });
      }

      case "fr": {
        // Funding Rate – latest funding rate entry
        const resp = await fetch(
          `${BINANCE_FAPI}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
          { signal: ctrl.signal, headers: { "User-Agent": "cryptomainly-portal" } }
        );
        clearTimeout(tm);
        if (!resp.ok) return err(`Upstream FR error: ${resp.status}`);
        const arr = (await resp.json()) as Array<{
          symbol: string;
          fundingRate: string;
          fundingTime: number;
        }>;
        if (!arr?.length) return err("No FR data");
        const latest = arr[0];
        const fr = Number(latest.fundingRate) * 100; // percent
        return ok({
          metric: "fr",
          value: fr,
          formatted: `${fr >= 0 ? "+" : ""}${fr.toFixed(4)}%`,
          ts: latest.fundingTime,
          source: "binance",
        });
      }

      case "lsr": {
        // Global Long/Short Account Ratio (5m)
        const resp = await fetch(
          `${BINANCE_FUTURES}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
          { signal: ctrl.signal, headers: { "User-Agent": "cryptomainly-portal" } }
        );
        clearTimeout(tm);
        if (!resp.ok) return err(`Upstream LSR error: ${resp.status}`);
        const arr = (await resp.json()) as Array<{
          symbol: string;
          longShortRatio: string; // e.g. "1.1234" (long/short)
          longAccount: string;
          shortAccount: string;
          timestamp: number;
        }>;
        if (!arr?.length) return err("No LSR data");
        const latest = arr[0];
        const ratio = Number(latest.longShortRatio);
        // Convert to % longs for your widget (optional) or just return the ratio
        const pctLong = (ratio / (1 + ratio)) * 100; // ratio = long/short
        return ok({
          metric: "lsr",
          value: ratio,
          pctLong,
          formatted: `${pctLong.toFixed(1)}% L`,
          ts: latest.timestamp,
          source: "binance",
        });
      }
    }
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout fetching metric" : String(e?.message || e);
    return err(msg, 504);
  }
}
