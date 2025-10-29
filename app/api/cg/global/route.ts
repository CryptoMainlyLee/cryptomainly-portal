// app/api/cg/global/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // no caching by Vercel
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global", {
      headers: { accept: "application/json" },
      // no-store removes caching layers that sometimes return stale/empty
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch CoinGecko global", status: res.status },
        { status: res.status }
      );
    }

    const j = await res.json();

    // Map to the exact shape your bar expects
    const data = {
      coins: j?.data?.active_cryptocurrencies ?? 0,
      markets: j?.data?.markets ?? 0,
      marketCap: j?.data?.total_market_cap?.usd ?? 0,
      vol24h: j?.data?.total_volume?.usd ?? 0,
      btcDom: j?.data?.market_cap_percentage?.btc ?? 0,
      ethDom: j?.data?.market_cap_percentage?.eth ?? 0,
      mcChange24h: j?.data?.market_cap_change_percentage_24h_usd ?? 0,
    };

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy error", message: String(err) },
      { status: 500 }
    );
  }
}
