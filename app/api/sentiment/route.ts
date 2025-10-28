// app/api/sentiment/route.ts
import { NextResponse } from "next/server";

export const revalidate = 3600; // 60 minutes (ISR for this route)

export async function GET() {
  // helpers
  const getJSON = async <T,>(url: string) => {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return (await res.json()) as T;
  };

  try {
    // Fear & Greed (Alternative.me)
    type FNGResp = { data: { value: string; value_classification: string; timestamp: string }[] };
    const fng = await getJSON<FNGResp>("https://api.alternative.me/fng/?limit=1");
    const fngLatest = fng?.data?.[0];

    // Altseason (BlockchainCenter) — graceful fallback if unavailable
    // Known community endpoint; if they change, UI will show "unavailable".
    let altseasonScore: number | null = null;
    try {
      const alt = await getJSON<{ altseason: number }>("https://www.blockchaincenter.net/api/altseason/");
      if (typeof alt?.altseason === "number") altseasonScore = alt.altseason;
    } catch {
      altseasonScore = null;
    }

    return NextResponse.json({
      fearGreed: fngLatest
        ? {
            value: Number(fngLatest.value),
            label: fngLatest.value_classification,
            updatedAt: Number(fngLatest.timestamp) * 1000,
          }
        : null,
      altseason:
        typeof altseasonScore === "number"
          ? {
              value: Math.round(altseasonScore),
              // 0 = BTC season, 100 = Altseason (matches BlockchainCenter legend)
            }
          : null,
      revalidatedAt: Date.now(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        fearGreed: null,
        altseason: null,
        error: "Failed to fetch one or more sentiment sources.",
      },
      { status: 200 }
    );
  }
}
