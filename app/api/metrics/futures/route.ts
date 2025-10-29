import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Binance endpoints (public)
const OI_BTC = "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1";
const OI_ETH = "https://fapi.binance.com/futures/data/openInterestHist?symbol=ETHUSDT&period=5m&limit=1";
const FUNDING_BTC = "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1";
const FUNDING_ETH = "https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1";
const LS_RATIO = "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1";

export async function GET() {
  try {
    const [oiBtc, oiEth, frBtc, frEth, ls] = await Promise.all([
      fetch(OI_BTC).then(r => r.json()).catch(() => []),
      fetch(OI_ETH).then(r => r.json()).catch(() => []),
      fetch(FUNDING_BTC).then(r => r.json()).catch(() => []),
      fetch(FUNDING_ETH).then(r => r.json()).catch(() => []),
      fetch(LS_RATIO).then(r => r.json()).catch(() => []),
    ]);

    const data = {
      oiBtc: oiBtc?.[0]?.sumOpenInterestValue ? Number(oiBtc[0].sumOpenInterestValue) / 1e9 : null,
      oiEth: oiEth?.[0]?.sumOpenInterestValue ? Number(oiEth[0].sumOpenInterestValue) / 1e9 : null,
      frBtc: frBtc?.[0]?.fundingRate ? Number(frBtc[0].fundingRate) * 100 : null,
      frEth: frEth?.[0]?.fundingRate ? Number(frEth[0].fundingRate) * 100 : null,
      lsRatio: ls?.[0]?.longShortRatio ? Number(ls[0].longShortRatio) : null,
      ts: new Date().toISOString(),
    };

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
