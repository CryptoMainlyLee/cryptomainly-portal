// app/api/metrics/binance/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 30;

import { NextResponse } from "next/server";

type Metric = "funding" | "open-interest" | "long-short";

// Primary + mirrors (Binance sometimes geo-fences individual POPs)
const ORIGINS = [
  "https://fapi.binance.com",           // primary
  "https://fapi.binancefuture.com",     // mirror 1
  "https://api1.binance.com",           // spot domain (some data endpoints route here)
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function buildPath(origin: string, metric: Metric, symbol: string) {
  // try both historical-data style and REST-style paths, some POPs differ
  const paths: string[] = [];

  if (metric === "funding") {
    paths.push(`${origin}/futures/data/fundingRate?symbol=${symbol}&limit=1`);
    paths.push(`${origin}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
  } else if (metric === "open-interest") {
    // 5m granularity—small payload
    paths.push(
      `${origin}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=1`
    );
  } else if (metric === "long-short") {
    paths.push(
      `${origin}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`
    );
  }

  return paths;
}

async function tryFetch(url: string) {
  // IMPORTANT: present as a server request and avoid forwarding client IP
  const res = await fetch(url, {
    // keep each attempt fresh
    cache: "no-store",
    headers: {
      "User-Agent": UA,
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Origin": "https://www.binance.com",
      "Referer": "https://www.binance.com/",
      // override any proxy chain headers that could leak EU/UK client IP
      "X-Forwarded-For": "8.8.8.8",
      "X-Real-IP": "8.8.4.4",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
      "Connection": "close",
    },
  });

  // Some Binance POPs return 451 with HTML body; standardize the error
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: null as any };
  }

  // Binance sometimes replies text for tiny arrays; parse defensively
  const text = await res.text();
  try {
    return { ok: true as const, status: 200, body: JSON.parse(text) };
  } catch {
    // If it looks like CSV or single object, still return it so UI can handle
    return { ok: true as const, status: 200, body: text };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const metric = (searchParams.get("metric") ||
    "funding") as Metric;

  const candidates: string[] = [];
  for (const origin of ORIGINS) {
    for (const path of buildPath(origin, metric, symbol)) {
      candidates.push(path);
    }
  }

  // Try each candidate until one returns 200
  for (const url of candidates) {
    const r = await tryFetch(url);
    if (r.ok) {
      return NextResponse.json({ ok: true, data: r.body });
    }
    // if hard 451/403, keep trying next
    if (r.status !== 451 && r.status !== 403) {
      // bubble other errors early (e.g. 5xx)
      return NextResponse.json({ ok: false, error: `Upstream error: ${r.status}`, url }, { status: 502 });
    }
  }

  return NextResponse.json(
    { ok: false, error: "All Binance POPs returned 451/403 (geo/fence).", tried: candidates },
    { status: 451 }
  );
}
