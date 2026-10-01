import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TARGET_HOURS = 8;
const TTL_MS = 60_000;
const TIMEOUT_MS = 8_000;

type Venue = {
  exchange: "Binance" | "Bybit" | "Bitget" | "OKX" | "Hyperliquid" | "Gate.io";
  fundingRate: number;
  fundingIntervalHours: number;
  fundingRate8h: number;
  oiUsd: number;
};

type CoinFunding = {
  fundingRate: number | null;
  totalOiUsd: number;
  venues: Venue[];
  errors: string[];
};

type Payload = {
  ok: boolean;
  stale: boolean;
  normalizedHours: 8;
  btc: CoinFunding;
  eth: CoinFunding;
  sources: string[];
  ts: number;
};

let cache: Omit<Payload, "ok" | "stale"> | null = null;
let cacheTs = 0;

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "CryptoMainly/1.0" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function makeVenue(
  exchange: Venue["exchange"],
  fundingRate: number | null,
  fundingIntervalHours: number | null,
  oiUsd: number | null
): Venue {
  if (fundingRate == null || fundingIntervalHours == null || fundingIntervalHours <= 0 || oiUsd == null || oiUsd <= 0) {
    throw new Error(`${exchange}: incomplete funding/open-interest data`);
  }
  return {
    exchange,
    fundingRate,
    fundingIntervalHours,
    fundingRate8h: fundingRate * (TARGET_HOURS / fundingIntervalHours),
    oiUsd,
  };
}

async function binance(symbol: string): Promise<Venue> {
  const [premium, oi] = await Promise.all([
    fetchJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
    fetchJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
  ]);
  const rate = finite(premium?.lastFundingRate);
  const mark = finite(premium?.markPrice);
  const openInterest = finite(oi?.openInterest);
  return makeVenue("Binance", rate, 8, mark != null && openInterest != null ? mark * openInterest : null);
}

async function bybit(symbol: string): Promise<Venue> {
  const json = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
  if (json?.retCode !== 0) throw new Error(`Bybit: ${json?.retMsg ?? "request failed"}`);
  const row = json?.result?.list?.[0];
  return makeVenue(
    "Bybit",
    finite(row?.fundingRate),
    finite(row?.fundingIntervalHour),
    finite(row?.openInterestValue)
  );
}

async function bitget(symbol: string): Promise<Venue> {
  const [ticker, funding] = await Promise.all([
    fetchJson(`https://api.bitget.com/api/v3/market/tickers?category=USDT-FUTURES&symbol=${symbol}`),
    fetchJson(`https://api.bitget.com/api/v3/market/current-fund-rate?category=USDT-FUTURES&symbol=${symbol}`),
  ]);
  if (ticker?.code !== "00000" || funding?.code !== "00000") throw new Error("Bitget: request failed");
  const t = ticker?.data?.[0];
  const f = funding?.data?.[0];
  const oi = finite(t?.openInterest);
  const mark = finite(t?.markPrice) ?? finite(t?.lastPrice);
  return makeVenue("Bitget", finite(f?.fundingRate), finite(f?.fundingRateInterval), oi != null && mark != null ? oi * mark : null);
}

async function okx(base: "BTC" | "ETH"): Promise<Venue> {
  const instId = `${base}-USDT-SWAP`;
  const [funding, oi] = await Promise.all([
    fetchJson(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`),
    fetchJson(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`),
  ]);
  if (funding?.code !== "0" || oi?.code !== "0") throw new Error("OKX: request failed");
  const f = funding?.data?.[0];
  const o = oi?.data?.[0];
  const current = finite(f?.fundingTime);
  const next = finite(f?.nextFundingTime);
  const prev = finite(f?.prevFundingTime);
  const intervalMs = next != null && current != null ? next - current : current != null && prev != null ? current - prev : null;
  const intervalHours = intervalMs != null && intervalMs > 0 ? intervalMs / 3_600_000 : 8;
  return makeVenue("OKX", finite(f?.fundingRate), intervalHours, finite(o?.oiUsd));
}

async function hyperliquid(base: "BTC" | "ETH"): Promise<Venue> {
  const json = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "CryptoMainly/1.0" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  }).then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); });
  const meta = json?.[0]?.universe;
  const contexts = json?.[1];
  const idx = Array.isArray(meta) ? meta.findIndex((x: any) => x?.name === base) : -1;
  const row = idx >= 0 ? contexts?.[idx] : null;
  const oi = finite(row?.openInterest), mark = finite(row?.markPx);
  return makeVenue("Hyperliquid", finite(row?.funding), 1, oi != null && mark != null ? oi * mark : null);
}

async function gate(base: "BTC" | "ETH"): Promise<Venue> {
  const contract = `${base}_USDT`;
  const [info, stats] = await Promise.all([
    fetchJson(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${contract}`),
    fetchJson(`https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract=${contract}&limit=1`),
  ]);
  return makeVenue("Gate.io", finite(info?.funding_rate), (finite(info?.funding_interval) ?? 0) / 3600, finite(stats?.[0]?.open_interest_usd));
}

async function safe(label: string, fn: () => Promise<Venue>) {
  try {
    return { venue: await fn(), error: null as string | null };
  } catch (e: any) {
    return { venue: null as Venue | null, error: `${label}: ${String(e?.message || e)}` };
  }
}

function aggregate(results: Awaited<ReturnType<typeof safe>>[]): CoinFunding {
  const venues = results.map((r) => r.venue).filter((v): v is Venue => v != null);
  const errors = results.map((r) => r.error).filter((e): e is string => Boolean(e));
  const totalOiUsd = venues.reduce((sum, v) => sum + v.oiUsd, 0);
  const fundingRate = totalOiUsd > 0
    ? venues.reduce((sum, v) => sum + v.fundingRate8h * v.oiUsd, 0) / totalOiUsd
    : null;
  return { fundingRate, totalOiUsd, venues, errors };
}

async function buildCoin(base: "BTC" | "ETH") {
  const symbol = `${base}USDT`;
  const results = await Promise.all([
    safe("Binance", () => binance(symbol)),
    safe("Bybit", () => bybit(symbol)),
    safe("Bitget", () => bitget(symbol)),
    safe("OKX", () => okx(base)),
    safe("Hyperliquid", () => hyperliquid(base)),
    safe("Gate.io", () => gate(base)),
  ]);
  return aggregate(results);
}

export async function GET() {
  const now = Date.now();
  const headers = {
    "Cache-Control": "public, s-maxage=60, max-age=0, stale-while-revalidate=120",
  };

  if (cache && now - cacheTs <= TTL_MS) {
    return NextResponse.json<Payload>({ ok: true, stale: false, ...cache }, { headers });
  }

  const [btc, eth] = await Promise.all([buildCoin("BTC"), buildCoin("ETH")]);
  const allVenues = [...btc.venues, ...eth.venues];
  const sources = Array.from(new Set(allVenues.map((v) => v.exchange)));
  const ok = btc.fundingRate != null && eth.fundingRate != null && btc.venues.length >= 3 && eth.venues.length >= 3;
  const stale = !ok;
  const payload = { normalizedHours: 8 as const, btc, eth, sources, ts: now };

  if (!ok) {
    return NextResponse.json<Payload>({ ok: false, stale: true, ...payload }, { status: 502, headers });
  }

  cache = payload;
  cacheTs = now;
  return NextResponse.json<Payload>({ ok: true, stale, ...payload }, { headers });
}
