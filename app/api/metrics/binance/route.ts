// app/api/metrics/binance/route.ts
import { NextRequest } from "next/server";

const BASE_URL = "https://fapi.binance.com/fapi/v1";

const METRIC_MAP = {
  oi: { current: "/openInterest", hist: "/openInterestHist", interval: "5m" },
  fr: { current: "/premiumIndex", hist: "/fundingRate" },
  ls: { current: "/globalLongShortAccountRatio" },
} as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol"); // e.g., BTCUSDT
  const metric = searchParams.get("metric") as keyof typeof METRIC_MAP;

  if (!symbol || !metric || !METRIC_MAP[metric]) {
    return Response.json(
      { ok: false, error: "Invalid symbol or metric (oi/fr/ls)" },
      { status: 400 }
    );
  }

  try {
    const { current, hist, interval } = METRIC_MAP[metric];
    let curr: number | null = null;
    let prev: number | null = null;

    // Fetch current value
    const currentRes = await fetch(`${BASE_URL}${current}?symbol=${symbol}`);
    if (!currentRes.ok) throw new Error(`Current fetch failed: ${currentRes.status}`);
    const currentData = await currentRes.json();
    if (metric === "ls") {
      curr = parseFloat(currentData.longShortRatio || "0");
    } else {
      // OI: sumOpenInterest; FR: lastFundingRate (as string, e.g., "0.0001")
      const key = metric === "oi" ? "sumOpenInterest" : "lastFundingRate";
      curr = parseFloat(currentData[key] || "0");
    }

    // Fetch previous value (if applicable)
    if (metric !== "ls") {
      const histParams = new URLSearchParams({
        symbol,
        limit: "2",
        ...(interval && { period: interval }),
      });
      const histRes = await fetch(`${BASE_URL}${hist}?${histParams}`);
      if (!histRes.ok) throw new Error(`Hist fetch failed: ${histRes.status}`);
      const histData = await histRes.json();
      if (Array.isArray(histData) && histData.length >= 2) {
        const prevItem = histData[0]; // First is most recent historical (previous to current)
        const key = metric === "oi" ? "sumOpenInterest" : "fundingRate";
        prev = parseFloat(prevItem[key] || "0");
      }
    }

    return Response.json({
      ok: true,
      curr,
      prev,
      stale: false,
    });
  } catch (error) {
    console.error("Binance proxy error:", error);
    return Response.json({ ok: false, stale: true });
  }
}