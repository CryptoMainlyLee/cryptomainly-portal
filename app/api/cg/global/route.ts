import { NextResponse } from "next/server";

const API = "https://api.coingecko.com/api/v3/global";

export const revalidate = 60; // ISR-style cache at the edge (60s)

export async function GET() {
  try {
    const res = await fetch(API, {
      headers: {
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY || "",
      },
      // in case you’re on dev and don’t want full caching:
      // cache: "no-store",
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Coingecko ${res.status} ${text}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Network error" }, { status: 500 });
  }
}
