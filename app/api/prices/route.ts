import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PriceRow = {
  id: string;          // coingecko id (e.g., "bitcoin")
  symbol: string;      // short ticker (e.g., "BTC")
  name: string;        // display name (e.g., "Bitcoin")
  price: number | null;
  change24h: number | null; // percent
  ts: number;
};

type Payload = {
  ok: boolean;
  stale: boolean;
  rows: PriceRow[];
  ts: number;
  error?: string;
};

// --- tune these as you like
const IDS: Array<[id: string, symbol: string, name: string]> = [
  ["bitcoin", "BTC", "Bitcoin"],
  ["ethereum", "ETH", "Ethereum"],
  ["ripple", "XRP", "XRP"],
  ["binancecoin", "BNB", "BNB"],
  ["solana", "SOL", "Solana"],
  ["dogecoin", "DOGE", "Dogecoin"],
  ["tron", "TRX", "TRON"],
  ["cardano", "ADA", "Cardano"],
  ["chainlink", "LINK", "Chainlink"],
  ["litecoin", "LTC", "Litecoin"],
];

const S_MAXAGE = 45;             // edge cache
const TTL_MS = 45_000;           // in-process TTL
const TIMEOUT_MS = 10_000;

let cache: Omit<Payload, "ok" | "stale"> | null = null;
let cacheTs = 0;

function timeout<T>(ms: number, p: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function fetchWithRetry(url: string, tries = 3) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await timeout(
        TIMEOUT_MS,
        fetch(url, { cache: "no-store", headers: { "User-Agent": "CryptoMainly/1.0" } })
      );
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      const delay = (i === 0 ? 300 : i === 1 ? 900 : 1800) + Math.floor(Math.random() * 200);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

export async function GET() {
  const now = Date.now();
  const headers = { "Cache-Control": `public, s-maxage=${S_MAXAGE}, max-age=0, stale-while-revalidate=30` };

  const freshNeeded = now - cacheTs > TTL_MS;
  if (!freshNeeded && cache) {
    return NextResponse.json<Payload>({ ok: true, stale: false, ...cache }, { headers });
  }

  const ids = IDS.map(([id]) => id).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids
  )}&vs_currencies=usd&include_24hr_change=true`;

  try {
    const j = await fetchWithRetry(url);
    const rows: PriceRow[] = IDS.map(([id, symbol, name]) => {
      const row = j?.[id];
      return {
        id,
        symbol,
        name,
        price: typeof row?.usd === "number" ? row.usd : null,
        change24h: typeof row?.usd_24h_change === "number" ? row.usd_24h_change : null,
        ts: now,
      };
    });

    cache = { rows, ts: now };
    cacheTs = now;
    return NextResponse.json<Payload>({ ok: true, stale: false, rows, ts: now }, { headers });
  } catch (e: any) {
    if (cache) {
      return NextResponse.json<Payload>({ ok: true, stale: true, ...cache, error: String(e?.message || e) }, { headers });
    }
    return NextResponse.json<Payload>({ ok: false, stale: true, rows: [], ts: now, error: String(e?.message || e) }, { headers });
  }
}
