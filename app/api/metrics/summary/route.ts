import { NextResponse } from "next/server";

const BINANCE_OI_URL =
  "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1";
const BINANCE_FUNDING_URL =
  "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1";
const BINANCE_LONGSHORT_URL =
  "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1";
const FEARGREED_URL = "https://api.alternative.me/fng/?limit=1&format=json";

export async function GET() {
  try {
    const [oiRes, fundingRes, ratioRes, fngRes] = await Promise.allSettled([
      fetch(BINANCE_OI_URL, { next: { revalidate: 60 } }),
      fetch(BINANCE_FUNDING_URL, { next: { revalidate: 60 } }),
      fetch(BINANCE_LONGSHORT_URL, { next: { revalidate: 60 } }),
      fetch(FEARGREED_URL, { next: { revalidate: 3600 } }),
    ]);

    const openInterest =
      oiRes.status === "fulfilled" ? await oiRes.value.json() : null;
    const funding =
      fundingRes.status === "fulfilled" ? await fundingRes.value.json() : null;
    const ratio =
      ratioRes.status === "fulfilled" ? await ratioRes.value.json() : null;
    const fng =
      fngRes.status === "fulfilled" ? await fngRes.value.json() : null;

    const summary = {
      openInterest:
        Array.isArray(openInterest) && openInterest.length
          ? parseFloat(openInterest[0].sumOpenInterestValue)
          : null,
      fundingRate:
        Array.isArray(funding) && funding.length
          ? parseFloat(funding[0].fundingRate)
          : null,
      longShortRatio:
        Array.isArray(ratio) && ratio.length
          ? parseFloat(ratio[0].longShortRatio)
          : null,
      fearGreed:
        fng && fng.data && fng.data.length
          ? {
              value: parseInt(fng.data[0].value),
              classification: fng.data[0].value_classification,
            }
          : null,
    };

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("Metrics API error:", err);
    return NextResponse.json(
      { openInterest: null, fundingRate: null, longShortRatio: null, fearGreed: null },
      { status: 500 }
    );
  }
}
