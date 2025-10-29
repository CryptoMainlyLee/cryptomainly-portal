import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function hitJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://www.cryptomainly.co.uk/" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
  return body;
}

function withRelay(url: string) {
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
      `https://data-api.binance.vision/fapi/v1/openInterest?symbol=${symbol}`,
      `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
      `https://api.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
    ];

    const candidates = primaries.flatMap((u) => [u, ...withRelay(u)]);

    let data: any | null = null;
    let lastErr: any = null;

    for (const u of candidates) {
      try {
        const json = await hitJson(u);
        if (json && json.openInterest != null) {
          data = json;
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!data) throw lastErr || new Error("No data");

    const value =
      typeof data.openInterest === "string" ? parseFloat(data.openInterest) : Number(data.openInterest);

    return NextResponse.json({ ok: true, value, source: "binance" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 502 });
  }
}
