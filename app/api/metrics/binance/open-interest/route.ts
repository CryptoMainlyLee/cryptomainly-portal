import { NextResponse } from "next/server";

export const runtime = "edge";
export const preferredRegion = ["iad1", "sfo1", "pdx1"];
export const dynamic = "force-dynamic";
export const revalidate = 60;

// Binance OI (notional) 5m/15m/… history endpoints exist, but here we use the summary endpoint:
const OI_URL = (symbol: string) =>
  `https://www.binance.com/futures/data/openInterestNotional?symbol=${symbol}&period=5m&limit=1`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();

  try {
    const res = await fetch(OI_URL(symbol), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      next: { revalidate: 60 },
    });

    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, error: `Upstream ${res.status}` }, { status: 502 });

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "Upstream non-JSON (blocked/HTML)" }, { status: 502 });
    }

    if (!Array.isArray(data) || !data[0]?.sumOpenInterest) {
      return NextResponse.json({ ok: false, error: "No OI data" }, { status: 502 });
    }

    return NextResponse.json(
      {
        ok: true,
        symbol,
        openInterestNotional: Number(data[0].sumOpenInterest),
        timestamp: Number(data[0].timestamp ?? Date.now()),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
