import { NextResponse } from "next/server";

export async function GET() {
  try {
    const ids = [
      "bitcoin",
      "ethereum",
      "binancecoin",
      "ripple",
      "solana",
      "dogecoin",
      "cardano",
      "chainlink",
      "litecoin",
    ].join(",");

    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false`,
      {
        headers: { "Content-Type": "application/json" },
        next: { revalidate: 60 }, // 1 minute cache
      }
    );

    if (!res.ok) throw new Error("Failed to fetch data from CoinGecko");

    const data = await res.json();

    // Ensure we only pass what we need
    const formatted = data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      current_price: coin.current_price,
      price_change_percentage_24h: coin.price_change_percentage_24h,
    }));

    return NextResponse.json(formatted, { status: 200 });
  } catch (error: any) {
    console.error("CoinGecko API error:", error);
    return NextResponse.json({ error: "Unable to fetch data" }, { status: 500 });
  }
}
