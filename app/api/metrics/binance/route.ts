import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const BINANCE = {
  funding: (symbol: string) =>
    `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
  oi: (symbol: string) =>
    `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=1`,
  lsr: (symbol: string) =>
    `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
};

// Hosts + endpoints that have been seen in the wild for CoinGlass
const COINGLASS_HOSTS = [
  "https://open-api-v2.coinglass.com/api",
  "https://open-api.coinglass.com/api",
];

const COINGLASS_HEADERS_NAMES = [
  "coinglassSecret", // older docs / examples
  "X-COINGLASS-SECRET", // newer convention
];

const COINGLASS = {
  // try several endpoint spellings for each metric (v1/v2 style)
  funding: (symbol: string) => [
    `/futures/funding_rate?symbol=${symbol}`,
    `/futures/fundingRate?symbol=${symbol}`,
  ],
  oi: (symbol: string) => [
    `/futures/open_interest?symbol=${symbol}`,
    `/futures/openInterest?symbol=${symbol}`,
  ],
  lsr: (symbol: string) => [
    `/futures/global_long_short_account_ratio?symbol=${symbol}`,
    `/futures/globalLongShortAccountRatio?symbol=${symbol}`,
  ],
};

// Helpers
async function fetchJSON(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave json = null, we’ll return text for debugging
  }
  return { ok: res.ok, status: res.status, headers: res.headers, text, json };
}

function normalizeSymbol(raw: string | null) {
  const s = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s || "BTCUSDT";
}

// Try Binance first; on 451/403/5xx, try CoinGlass variants
export async function GET(req: Request) {
  const url = new URL(req.url);
  const metric = (url.searchParams.get("metric") || "").toLowerCase();
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  const debug = url.searchParams.get("debug") === "1";

  if (!["funding", "oi", "lsr"].includes(metric)) {
    return NextResponse.json(
      { ok: false, error: "Unknown metric; use funding | oi | lsr" },
      { status: 400 }
    );
  }

  // --- 1) Binance attempt
  const binURL = BINANCE[metric as "funding" | "oi" | "lsr"](symbol);
  const bin = await fetchJSON(binURL, {
    headers: { "User-Agent": UA, Referer: "https://www.cryptomainly.co.uk" },
    cache: "no-store",
  });

  if (bin.ok) {
    const data = tryNormalize(metric, bin.json ?? bin.text);
    return NextResponse.json({ ok: true, source: "binance", data, raw: debug ? bin : undefined });
  }

  // If not a geoblock / upstream problem, still provide debug
  const binanceBlocked = [451, 403, 429, 500, 502, 503, 504].includes(bin.status);

  // --- 2) CoinGlass fallback
  const key = process.env.COINGLASS_API_KEY || process.env.COINGLASS_SECRET;
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        error: `No CoinGlass key available and Binance failed (${bin.status}).`,
        binance: debug ? bin : undefined,
      },
      { status: 502 }
    );
  }

  for (const host of COINGLASS_HOSTS) {
    for (const p of COINGLASS[metric as "funding" | "oi" | "lsr"](symbol)) {
      const url = `${host}${p}`;
      for (const headerName of COINGLASS_HEADERS_NAMES) {
        const cg = await fetchJSON(url, {
          headers: {
            [headerName]: key,
            "User-Agent": UA,
            Accept: "application/json",
          } as HeadersInit,
          cache: "no-store",
        });

        if (cg.ok) {
          const data = tryNormalize(metric, cg.json ?? cg.text);
          return NextResponse.json({
            ok: true,
            source: "coinglass",
            data,
            raw: debug ? cg : undefined,
          });
        }

        // If debug, surface the failed attempt to help us pin the correct path quickly
        if (debug) {
          // eslint-disable-next-line no-console
          console.error("CoinGlass attempt", { url, headerName, status: cg.status, body: cg.text?.slice(0, 400) });
        }
      }
    }
  }

  // Nothing worked; return the best diagnostics we have
  return NextResponse.json(
    {
      ok: false,
      error: `All upstreams failed. Binance ${bin.status}${binanceBlocked ? " (likely geoblock)" : ""}. CoinGlass returned non-2xx on all variants.`,
      binance: debug ? bin : undefined,
    },
    { status: 502 }
  );
}

// Very light normalization so the widget can show a number if present.
// If shape is unexpected, we return the raw object and let the UI handle it.
function tryNormalize(metric: string, body: any) {
  try {
    if (metric === "funding") {
      // Binance: array with [{ fundingRate }]
      if (Array.isArray(body) && body[0]?.fundingRate != null) {
        return Number(body[0].fundingRate);
      }
      // CoinGlass v2/v1: look for data[0].fundingRate or .rate
      const cg = body?.data?.[0] ?? body?.data ?? body;
      const val = cg?.fundingRate ?? cg?.rate ?? cg?.value;
      if (val != null) return Number(val);
    }

    if (metric === "oi") {
      // Binance OI hist: array with [{ sumOpenInterest }]
      if (Array.isArray(body) && body[0]?.sumOpenInterest != null) {
        return Number(body[0].sumOpenInterest);
      }
      const cg = body?.data?.[0] ?? body?.data ?? body;
      const val = cg?.openInterest ?? cg?.oi ?? cg?.value;
      if (val != null) return Number(val);
    }

    if (metric === "lsr") {
      // Binance global L/S: array with [{ longShortRatio }]
      if (Array.isArray(body) && body[0]?.longShortRatio != null) {
        return Number(body[0].longShortRatio);
      }
      const cg = body?.data?.[0] ?? body?.data ?? body;
      const val =
        cg?.longShortAccountRatio ??
        cg?.longShortRatio ??
        (cg?.longAccount && cg?.shortAccount ? Number(cg.longAccount) / Number(cg.shortAccount) : undefined);
      if (val != null) return Number(val);
    }
  } catch {
    /* fall through */
  }
  // Fallback: return raw so you can inspect with ?debug=1
  return body;
}
