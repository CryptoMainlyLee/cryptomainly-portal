import { NextResponse } from "next/server";
export const revalidate = 60;

export async function GET() {
  const url = "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1";
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status });
    const arr = await res.json(); // [{longShortRatio, longAccount, shortAccount, timestamp}]
    return NextResponse.json(arr?.[0] ?? null, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Network error" }, { status: 500 });
  }
}
