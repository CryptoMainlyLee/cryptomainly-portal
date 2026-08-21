import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CoinMetrics = {
  oiUsd: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
};

type DerivativesPayload = {
  ok: boolean;
  stale: boolean;
  source: "bitget";
  btc: CoinMetrics;
  eth: CoinMetrics;
  ts: number;
  error?: string;
};

const S_MAXAGE = 60;
const TTL_MS = 60_000;
const TIMEOUT_MS = 10_000;
const EMPTY: CoinMetrics = { oiUsd: null, fundingRate: null, longShortRatio: null };

let cache: Omit<DerivativesPayload, "ok" | "stale"> | null = null;
let cacheTs = 0;

const tickerUrl = (symbol: string) =>
  `https://api.bitget.com/api/v3/market/tickers?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`;

// Use Bitget's dedicated current-funding-rate endpoint rather than relying on
// the generic ticker field. Bitget returns funding rates in decimal form
// (for example 0.0001 = 0.01%).
const fundingUrl = (symbol: string) =>
  `https://api.bitget.com/api/v3/market/current-fund-rate?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`;

const longShortUrl = (symbol: string) =>
  `https://api.bitget.com/api/v3/market/futures-long-short?symbol=${encodeURIComponent(symbol)}&period=5m`;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "CryptoMainly/1.0",
      },
    });

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    if (json?.code !== "00000") {
      throw new Error(`Bitget ${json?.code ?? "unknown"}: ${json?.msg ?? "request failed"}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetch(url: string): Promise<{ data: any | null; error: string | null }> {
  try {
    return { data: await fetchJson(url), error: null };
  } catch (e: any) {
    return { data: null, error: String(e?.message || e) };
  }
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOpenInterestUsd(json: any): number | null {
  const row = Array.isArray(json?.data) ? json.data[0] : null;
  if (!row) return null;

  const oi = finiteNumber(row.openInterest);
  const mark = finiteNumber(row.markPrice) ?? finiteNumber(row.lastPrice);

  // Bitget USDT-futures openInterest is returned in base-asset units.
  // Multiplying by the mark price produces the approximate USD notional.
  return oi != null && mark != null ? oi * mark : null;
}

function parseFundingRate(json: any): number | null {
  const row = Array.isArray(json?.data) ? json.data[0] : null;
  return finiteNumber(row?.fundingRate);
}

function parseLongShort(json: any): number | null {
  const rows = Array.isArray(json?.data) ? [...json.data] : [];
  if (!rows.length) return null;

  rows.sort((a, b) => Number(b?.ts ?? 0) - Number(a?.ts ?? 0));
  const latest = rows[0];

  const direct = finiteNumber(latest?.longShortRatio ?? latest?.longShortAccountRatio);
  if (direct != null) return direct;

  const long = finiteNumber(latest?.longRatio ?? latest?.longAccountRatio);
  const short = finiteNumber(latest?.shortRatio ?? latest?.shortAccountRatio);
  return long != null && short != null && short !== 0 ? long / short : null;
}

function firstNonNull<T>(fresh: T | null, previous: T | null | undefined): T | null {
  return fresh != null ? fresh : previous ?? null;
}

export async function GET() {
  const now = Date.now();
  const headers = {
    "Cache-Control": `public, s-maxage=${S_MAXAGE}, max-age=0, stale-while-revalidate=120`,
  };

  if (cache && now - cacheTs <= TTL_MS) {
    return NextResponse.json<DerivativesPayload>(
      { ok: true, stale: false, ...cache },
      { headers }
    );
  }

  // Open interest and current funding rate endpoints have generous public
  // limits, so obtain BTC and ETH together.
  const [btcTicker, ethTicker, btcFunding, ethFunding] = await Promise.all([
    safeFetch(tickerUrl("BTCUSDT")),
    safeFetch(tickerUrl("ETHUSDT")),
    safeFetch(fundingUrl("BTCUSDT")),
    safeFetch(fundingUrl("ETHUSDT")),
  ]);

  // Bitget's public long/short endpoint is more restrictive, so fetch these
  // sequentially. A failure here must not take down OI or funding data.
  const btcLongShort = await safeFetch(longShortUrl("BTCUSDT"));
  await delay(1100);
  const ethLongShort = await safeFetch(longShortUrl("ETHUSDT"));

  const errors = [
    btcTicker.error,
    ethTicker.error,
    btcFunding.error,
    ethFunding.error,
    btcLongShort.error,
    ethLongShort.error,
  ].filter(Boolean) as string[];

  const previousBtc = cache?.btc ?? EMPTY;
  const previousEth = cache?.eth ?? EMPTY;

  const btc: CoinMetrics = {
    oiUsd: firstNonNull(parseOpenInterestUsd(btcTicker.data), previousBtc.oiUsd),
    fundingRate: firstNonNull(parseFundingRate(btcFunding.data), previousBtc.fundingRate),
    longShortRatio: firstNonNull(parseLongShort(btcLongShort.data), previousBtc.longShortRatio),
  };

  const eth: CoinMetrics = {
    oiUsd: firstNonNull(parseOpenInterestUsd(ethTicker.data), previousEth.oiUsd),
    fundingRate: firstNonNull(parseFundingRate(ethFunding.data), previousEth.fundingRate),
    longShortRatio: firstNonNull(parseLongShort(ethLongShort.data), previousEth.longShortRatio),
  };

  const hasAnyData = [...Object.values(btc), ...Object.values(eth)].some((v) => v != null);

  if (!hasAnyData) {
    return NextResponse.json<DerivativesPayload>(
      {
        ok: false,
        stale: true,
        source: "bitget",
        btc: EMPTY,
        eth: EMPTY,
        ts: now,
        error: errors.join(" | ") || "No Bitget derivatives data returned",
      },
      { status: 502, headers }
    );
  }

  const payload: Omit<DerivativesPayload, "ok" | "stale"> = {
    source: "bitget",
    btc,
    eth,
    ts: now,
    ...(errors.length ? { error: errors.join(" | ") } : {}),
  };

  cache = payload;
  cacheTs = now;

  return NextResponse.json<DerivativesPayload>(
    { ok: true, stale: errors.length > 0, ...payload },
    { headers }
  );
}
