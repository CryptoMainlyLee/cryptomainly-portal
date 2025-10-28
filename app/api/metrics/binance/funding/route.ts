import { NextResponse } from "next/server";
export const revalidate = 300;

export async function GET() {
  const url = "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1";
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status });
    const arr = await res.json(); // [{fundingRate, fundingTime}]
    return NextResponse.json(arr?.[0] ?? null, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Network error" }, { status: 500 });
  }
}
