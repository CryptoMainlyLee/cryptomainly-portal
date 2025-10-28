import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GlobalPayload = {
  ok: boolean;
  stale: boolean;           // true if served from cache due to upstream issues
  btcDom: number | null;
  ethDom: number | null;
  mcap: number | null;
  vol24h: number | null;
  ts: number;               // server timestamp (ms)
  error?: string;
};

const SOURCE = "https://api.coingecko.com/api/v3/global";
const S_MAXAGE = 90;                 // edge cache
const TTL_MS = 90_000;               // our in-process TTL
const TIMEOUT_MS = 10_000;

let cache: Omit<GlobalPayload, "ok" | "stale"> | null = null;
let cacheTs = 0;

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
      // jitter backoff: 300ms, 900ms, 1800ms...
      const delay = (i === 0 ? 300 : i === 1 ? 900 : 1800) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function GET() {
  const now = Date.now();
  const headers = { "Cache-Control": `public, s-maxage=${S_MAXAGE}, max-age=0, stale-while-revalidate=60` };

  const freshNeeded = now - cacheTs > TTL_MS;
  if (!freshNeeded && cache) {
    return NextResponse.json<GlobalPayload>({ ok: true, stale: false, ...cache }, { headers });
  }

  try {
    const j = await fetchWithRetry(SOURCE);
    const d = j?.data ?? {};
    const payload = {
      btcDom: typeof d.market_cap_percentage?.btc === "number" ? d.market_cap_percentage.btc : null,
      ethDom: typeof d.market_cap_percentage?.eth === "number" ? d.market_cap_percentage.eth : null,
      mcap: typeof d.total_market_cap?.usd === "number" ? d.total_market_cap.usd : null,
      vol24h: typeof d.total_volume?.usd === "number" ? d.total_volume.usd : null,
      ts: now,
    };
    cache = payload;
    cacheTs = now;
    return NextResponse.json<GlobalPayload>({ ok: true, stale: false, ...payload }, { headers });
  } catch (e: any) {
    if (cache) {
      return NextResponse.json<GlobalPayload>({ ok: true, stale: true, ...cache, error: String(e?.message || e) }, { headers });
    }
    return NextResponse.json<GlobalPayload>(
      { ok: false, stale: true, btcDom: null, ethDom: null, mcap: null, vol24h: null, ts: now, error: String(e?.message || e) },
      { headers }
    );
  }
}
