import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function hitJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://www.cryptomainly.co.uk/" },
    cache: "no-store",
  });

  // If geo-blocked or otherwise not OK, throw to allow fallbacks
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // r.jina.ai sometimes sets text/plain; safely parse either way
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
  return body;
}

function withRelay(url: string) {
  // Try both http and https variants through the relay
  return [`https://r.jina.ai/${url.replace(/^https?:\/\//, "")}`, `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    const primaries = [
      `https://data-api.binance.vision/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
      `https://api.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
    ];

    const candidates = primaries.flatMap((u) => [u, ...withRelay(u)]);

    let data: any | null = null;
    let lastErr: any = null;

    for (const u of candidates) {
      try {
        const arr = await hitJson(u);
        if (Array.isArray(arr) && arr.length) {
          data = arr[0];
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!data) throw lastErr || new Error("No data");

    const value =
      typeof data.fundingRate === "string" ? parseFloat(data.fundingRate) : Number(data.fundingRate);

    return NextResponse.json({ ok: true, value, source: "binance" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 502 });
  }
}
