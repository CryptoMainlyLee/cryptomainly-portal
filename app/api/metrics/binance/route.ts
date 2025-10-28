import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PairPayload = { ok: boolean; stale: boolean; prev: number | null; curr: number | null; ts: number; error?: string };

const S_MAXAGE = 30;
const TTL_MS = 30_000;
const TIMEOUT_MS = 10_000;

type Key = `${"oi"|"fr"|"ls"}:${string}`; // metric:symbol
const cache = new Map<Key, Omit<PairPayload,"ok"|"stale">>();
const cacheTs = new Map<Key, number>();

function timeout<T>(ms: number, p: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function fetchWithRetry(url: string, tries = 3): Promise<any> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await timeout(TIMEOUT_MS, fetch(url, { cache: "no-store", headers: { "User-Agent": "CryptoMainly/1.0" } }));
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      const delay = (i === 0 ? 300 : i === 1 ? 900 : 1800) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") || "BTCUSDT";
  const metric = (url.searchParams.get("metric") || "oi") as "oi" | "fr" | "ls";
  const key: Key = `${metric}:${symbol}`;
  const now = Date.now();
  const headers = { "Cache-Control": `public, s-maxage=${S_MAXAGE}, max-age=0, stale-while-revalidate=30` };

  const freshNeeded = now - (cacheTs.get(key) || 0) > TTL_MS;
  if (!freshNeeded && cache.has(key)) {
    const c = cache.get(key)!;
    return NextResponse.json<PairPayload>({ ok: true, stale: false, ...c }, { headers });
  }

  let upstream = "";
  if (metric === "oi") upstream = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=2`;
  else if (metric === "fr") upstream = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=2`;
  else upstream = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=2`;

  try {
    const arr = await fetchWithRetry(upstream);
    let prev: number | null = null;
    let curr: number | null = null;
    if (metric === "oi") {
      prev = arr?.[0] ? Number(arr[0].sumOpenInterestValue ?? arr[0].sumOpenInterest ?? arr[0].openInterest) : null;
      curr = arr?.[1] ? Number(arr[1].sumOpenInterestValue ?? arr[1].sumOpenInterest ?? arr[1].openInterest) : null;
    } else if (metric === "fr") {
      prev = arr?.[0] ? Number(arr[0].fundingRate) : null;
      curr = arr?.[1] ? Number(arr[1].fundingRate) : null;
    } else {
      prev = arr?.[0] ? Number(arr[0].longShortRatio) : null;
      curr = arr?.[1] ? Number(arr[1].longShortRatio) : null;
    }
    const payload = { prev, curr, ts: now };
    cache.set(key, payload);
    cacheTs.set(key, now);
    return NextResponse.json<PairPayload>({ ok: true, stale: false, ...payload }, { headers });
  } catch (e: any) {
    if (cache.has(key)) {
      const c = cache.get(key)!;
      return NextResponse.json<PairPayload>({ ok: true, stale: true, ...c, error: String(e?.message || e) }, { headers });
    }
    return NextResponse.json<PairPayload>({ ok: false, stale: true, prev: null, curr: null, ts: now, error: String(e?.message || e) }, { headers });
  }
}
