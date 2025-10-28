import { NextResponse } from "next/server";

export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status });
    const json = await res.json(); // {data:[{value, value_classification, ...}]}
    return NextResponse.json(json, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Network error" }, { status: 500 });
  }
}
