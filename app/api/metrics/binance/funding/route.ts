import { NextResponse } from "next/server";

export const runtime = "edge";
export const preferredRegion = ["iad1", "sfo1", "pdx1"];
export const dynamic = "force-dynamic";
export const revalidate = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      next: { revalidate: 30 },
    });

    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, error: `Upstream ${res.status}` }, { status: 502 });

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "Upstream non-JSON (blocked/HTML)" }, { status: 502 });
    }

    if (!Array.isArray(data) || !data[0]?.fundingRate) {
      return NextResponse.json({ ok: false, error: "No funding data" }, { status: 502 });
    }

    return NextResponse.json(
      {
        ok: true,
        symbol,
        fundingRate: Number(data[0].fundingRate),
        fundingTime: data[0].fundingTime,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
