import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const revalidate = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) return NextResponse.json({ ok: false, error: "Missing ?symbol" }, { status: 400 });

    const res = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, {
      cache: "no-store", headers: { "User-Agent": "cryptomainly-metrics/1.0" }
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const json = await res.json(); // { openInterest: "..." }
    return NextResponse.json({ ok: true, value: Number(json.openInterest), source: "binance" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
