import { NextResponse } from "next/server";

export const runtime = "edge"; // fast, low-latency proxy

export async function GET() {
  try {
    // Hit CoinGecko from the server (no browser CORS/rate-limit noise)
    const r = await fetch("https://api.coingecko.com/api/v3/global", {
      // keep it fresh enough but not spamming their API
      next: { revalidate: 60 },
      // do not cache at the edge between requests
      cache: "no-store",
      headers: {
        // some CDNs/API gateways like a UA
        "User-Agent": "cryptomainly-portal/1.0",
        Accept: "application/json",
      },
    });

    if (!r.ok) {
      // Bubble a soft error with a consistent shape for the client
      return NextResponse.json(
        { ok: false, status: r.status, error: "fetch_upstream_failed" },
        { status: 200 }
      );
    }

    const json = await r.json();
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "proxy_exception" },
      { status: 200 }
    );
  }
}
