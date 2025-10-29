import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // ensure it's not pruned as static

export async function GET() {
  return NextResponse.json({ ok: true, note: "binance route alive" });
}
