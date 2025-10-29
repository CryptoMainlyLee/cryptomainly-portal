// app/api/metrics/binance/route.ts
import { NextRequest } from "next/server";

const BASE_URL = "https://fapi.binance.com/fapi/v1";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const metric = searchParams.get("metric") as "oi" | "fr" | "ls";

  if (!symbol || !["oi", "fr", "ls"].includes(metric)) {
    return Response.json({ ok: false, error: "Invalid params" }, { status: 400 });
  }

  try {
    let curr: number | null = null;
    let prev: number | null = null;

    // 1. Current value
    if (metric === "oi") {
      const res = await fetch(`${BASE_URL}/openInterest?symbol=${symbol}`);
      const data = await res.json();
      curr = parseFloat(data.sumOpenInterest || "0");
    }

    if (metric === "fr") {
      const res = await fetch(`${BASE_URL}/premiumIndex?symbol=${symbol}`);
      const data = await res.json();
      curr = parseFloat(data.lastFundingRate || "0");
    }

    if (metric === "ls") {
      const res = await fetch(`${BASE_URL}/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`);
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        curr = parseFloat(data[0].longShortRatio || "0");
      }
    }

    // 2. Previous value (for oi/fr)
    if (metric === "oi") {
      const res = await fetch(`${BASE_URL}/openInterestHist?symbol=${symbol}&period=5m&limit=2`);
      const data = await res.json();
      if (Array.isArray(data) && data.length >= 2) {
        prev = parseFloat(data[0].sumOpenInterest || "0");
      }
    }

    if (metric === "fr") {
      const res = await fetch(`${BASE_URL}/fundingRate?symbol=${symbol}&limit=2`);
      const data = await res.json();
      if (Array.isArray(data) && data.length >= 2) {
        prev = parseFloat(data[0].fundingRate || "0");
      }
    }

    return Response.json({ ok: true, curr, prev, stale: false });
  } catch (error) {
    console.error("Binance API error:", error);
    return Response.json({ ok: false, stale: true });
  }
}