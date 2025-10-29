// app/api/metrics/binance/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // don't prerender
export const revalidate = 0;

type Metric = "funding" | "oi" | "lsr";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REF = "https://www.cryptomainly.co.uk";

/** Safe JSON parser even if upstream replies text/plain */
async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const txt = await res.text();
  try {
    if (ct.includes("application/json")) return JSON.parse(txt);
    return JSON.parse(txt); // try anyway (many APIs send wrong CT)
  } catch {
    // expose a tiny hint for debugging but keep 200
    return { _raw: txt };
  }
}

function jOk(data: unknown) {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}
function jErr(message: string, status = 200) {
  // keep 200 so the widget doesn’t explode; message helps us debug
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** --- Upstreams ---------------------------------------------------------- */

async function fetchFunding(symbol: string) {
  // Binance funding (public, no key)
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: REF, Accept: "*/*" },
    // force fresh when the browser adds &t= to bypass edge caches
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Binance funding HTTP ${res.status}`);
  const arr = (await safeJson(res)) as any[];
  const last = Array.isArray(arr) && arr[0] ? arr[0] : null;
  const rate = last ? Number(last.fundingRate) : null;
  return { source: "binance", rate };
}

async function fetchLongShort(symbol: string) {
  // Binance global long/short account ratio (public)
  // Using 5m window; any valid period is ok for a single latest point
  const url = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: REF, Accept: "*/*" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Binance L/S HTTP ${res.status}`);
  const arr = (await safeJson(res)) as any[];
  const last = Array.isArray(arr) && arr[0] ? arr[0] : null;
  const ratio = last ? Number(last.longShortRatio) : null; // >1 = more longs
  return { source: "binance", ratio };
}

async function fetchOpenInterest(symbol: string) {
  // Primary: Binance OI (public)
  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: REF, Accept: "*/*" },
    cache: "no-store",
  });

  if (res.ok) {
    const arr = (await safeJson(res)) as any[];
    const last = Array.isArray(arr) && arr[0] ? arr[0] : null;
    const oi = last ? Number(last.sumOpenInterest) : null;
    return { source: "binance", oi };
  }

  // Optional fallback: Coinglass if key present (won’t break build if missing)
  const key = process.env.COINGLASS_KEY;
  if (key) {
    // Coinglass expects base symbol like BTC, not BTCUSDT
    const base = symbol.replace(/USDT|USD|PERP$/i, "");
    const cg = await fetch(
      `https://open-api.coinglass.com/public/v2/openInterest?symbol=${base}&currency=USD`,
      {
        headers: { "User-Agent": UA, Referer: REF, Accept: "application/json", "coinglassSecret": key },
        cache: "no-store",
      }
    );
    if (!cg.ok) throw new Error(`Coinglass OI HTTP ${cg.status}`);
    const data = (await safeJson(cg)) as any;
    const val =
      data?.data?.list?.[0]?.openInterest ||
      data?.data?.openInterest ||
      null;
    return { source: "coinglass", oi: val != null ? Number(val) : null };
  }

  throw new Error(`OI upstreams unavailable (Binance ${res.status}, no Coinglass key)`);
}

/** --- Route -------------------------------------------------------------- */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
    const metric = (searchParams.get("metric") || "funding").toLowerCase() as Metric;

    if (!["funding", "oi", "lsr"].includes(metric)) {
      return jErr(`Unsupported metric: ${metric}`);
    }

    if (metric === "funding") {
      const data = await fetchFunding(symbol);
      return jOk(data);
    }
    if (metric === "lsr") {
      const data = await fetchLongShort(symbol);
      return jOk(data);
    }
    // metric === "oi"
    const data = await fetchOpenInterest(symbol);
    return jOk(data);
  } catch (err: any) {
    // Keep 200 so the widget UI stays calm; include message for debugging
    return jErr(String(err?.message || err));
  }
}
