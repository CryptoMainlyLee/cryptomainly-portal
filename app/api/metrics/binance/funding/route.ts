// app/api/metrics/binance/funding/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";

  const endpoint = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      next: { revalidate: 30 },
    });

    // Detect non-JSON or blocked responses
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Upstream error: ${res.status}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Upstream returned non-JSON (likely HTML block)" },
        { status: 502 }
      );
    }

    // Validate Binance format
    if (!Array.isArray(data) || data.length === 0 || !data[0].fundingRate) {
      return NextResponse.json(
        { ok: false, error: "No valid funding data" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        fundingRate: parseFloat(data[0].fundingRate),
        fundingTime: data[0].fundingTime,
        symbol,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
