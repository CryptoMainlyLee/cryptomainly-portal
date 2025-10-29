// app/api/metrics/binance/route.ts
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";
const REF = "https://www.cryptomainly.co.uk";

type Metric = "funding" | "oi" | "lsr";

function ok(data: unknown) {
  return NextResponse.json({ ok: true, ...data }, {
    headers: {
      "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
    },
  });
}
function err(message: string, status = 502) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const metric = (url.searchParams.get("metric") || "funding").toLowerCase() as Metric;
    const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();

    if (!["funding", "oi", "lsr"].includes(metric)) {
      return err("Unsupported metric. Use funding | oi | lsr", 400);
    }

    // --- Try Binance first ---------------------------------------------------
    try {
      const bin = await fetchFromBinance(metric, symbol);
      if (bin) return ok({ metric, symbol, ...bin, source: "binance" });
    } catch (_) {
      /* fall through to CoinGlass */
    }

    // --- Fallback: CoinGlass -------------------------------------------------
    const cgKey = process.env.COINGLASS_KEY;
    if (!cgKey) return err("COINGLASS_KEY not configured", 500);

    const cg = await fetchFromCoinGlass(metric, symbol, cgKey);
    if (cg) return ok({ metric, symbol, ...cg, source: "coinglass" });

    return err("Both upstreams failed");
  } catch (e: any) {
    return err(String(e?.message || e), 500);
  }
}

// ----------------- Upstreams -----------------

async function fetchFromBinance(metric: Metric, symbol: string) {
  const headers = { "User-Agent": UA, Referer: REF };

  if (metric === "funding") {
    // https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Binance funding: ${res.status}`);
    const rows = await res.json();
    const last = Array.isArray(rows) ? rows[0] : undefined;
    if (!last?.fundingRate) return null;
    return { value: Number(last.fundingRate) };
  }

  if (metric === "oi") {
    // https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1
    const res = await fetch(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=1`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Binance oi: ${res.status}`);
    const rows = await res.json();
    const last = Array.isArray(rows) ? rows.at(-1) : undefined;
    if (!last?.sumOpenInterest) return null;
    return { value: Number(last.sumOpenInterest) };
  }

  if (metric === "lsr") {
    // Long/Short accounts ratio
    // https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1
    const res = await fetch(
      `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Binance lsr: ${res.status}`);
    const rows = await res.json();
    const last = Array.isArray(rows) ? rows.at(-1) : undefined;
    if (!last?.longShortRatio) return null;
    return { value: Number(last.longShortRatio) };
  }

  return null;
}

async function fetchFromCoinGlass(metric: Metric, symbol: string, key: string) {
  const base = "https://open-api.coinglass.com";
  const headers = {
    "User-Agent": UA,
    Referer: REF,
    "coinglassSecret": key,
    Accept: "application/json",
  };

  if (metric === "funding") {
    // https://open-api.coinglass.com/public/v2/funding?symbol=BTC&ex=Binance
    const coin = symbol.replace("USDT", "");
    const res = await fetch(
      `${base}/public/v2/funding?symbol=${coin}&ex=Binance`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`CoinGlass funding: ${res.status}`);
    const data = await res.json();
    const v = data?.data?.[0]?.uFR;
    if (v == null) return null;
    return { value: Number(v) / 100 }; // uFR is in %, convert to rate
  }

  if (metric === "oi") {
    // https://open-api.coinglass.com/public/v2/open_interest?symbol=BTC&ex=Binance
    const coin = symbol.replace("USDT", "");
    const res = await fetch(
      `${base}/public/v2/open_interest?symbol=${coin}&ex=Binance`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`CoinGlass oi: ${res.status}`);
    const data = await res.json();
    const v = data?.data?.[0]?.sumOpenInterestUsd ?? data?.data?.[0]?.sumOpenInterest;
    if (v == null) return null;
    return { value: Number(v) };
  }

  if (metric === "lsr") {
    // https://open-api.coinglass.com/public/v2/long_short_account?symbol=BTC&ex=Binance
    const coin = symbol.replace("USDT", "");
    const res = await fetch(
      `${base}/public/v2/long_short_account?symbol=${coin}&ex=Binance`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`CoinGlass lsr: ${res.status}`);
    const data = await res.json();
    const long = Number(data?.data?.[0]?.longAccount ?? 0);
    const short = Number(data?.data?.[0]?.shortAccount ?? 0);
    if (!long && !short) return null;
    return { value: long / Math.max(short, 1e-9) };
  }

  return null;
}
