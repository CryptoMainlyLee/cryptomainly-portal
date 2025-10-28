"use client";

import { useEffect, useState } from "react";

type SentimentData = {
  fearGreed?: number;
  altSeason?: number;
  fgLabel?: string;
  altLabel?: string;
};

export default function GlobalSentimentBar({ className = "" }: { className?: string }) {
  const [data, setData] = useState<SentimentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);

      // Fear & Greed index from alternative.me
      const fgRes = await fetch("https://api.alternative.me/fng/?limit=1");
      const fgJson = await fgRes.json();
      const fgValue = Number(fgJson?.data?.[0]?.value ?? 50);
      const fgLabel = fgJson?.data?.[0]?.value_classification ?? "Neutral";

      // Altseason index from your local API route
      const altRes = await fetch("/api/metrics/altseason");
      const altJson = await altRes.json();
      const altValue = Number(altJson?.value ?? 50);
      const altLabel = altJson?.label ?? "Neutral";

      setData({
        fearGreed: fgValue,
        altSeason: altValue,
        fgLabel,
        altLabel,
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 60 * 1000); // refresh every 60 min
    return () => clearInterval(t);
  }, []);

  const barStyle = "flex-1 text-center text-xs font-semibold";

  return (
    <div
      className={`w-full rounded-lg border border-white/10 bg-[#101b2a]/80 text-white/80 flex overflow-hidden ${className}`}
    >
      {error && (
        <div className="w-full text-center py-2 text-rose-400 text-xs">
          Temporarily unavailable
        </div>
      )}

      {!error && data && (
        <>
          <div className={`${barStyle} py-2 border-r border-white/10`}>
            <div className="text-white/60 text-[11px] uppercase">Fear & Greed</div>
            <div
              className={`text-sm font-bold ${
                data.fearGreed! >= 60
                  ? "text-emerald-400"
                  : data.fearGreed! <= 40
                  ? "text-rose-400"
                  : "text-yellow-400"
              }`}
            >
              {data.fearGreed?.toFixed(0)} — {data.fgLabel}
            </div>
          </div>

          <div className={`${barStyle} py-2`}>
            <div className="text-white/60 text-[11px] uppercase">Altseason Index</div>
            <div
              className={`text-sm font-bold ${
                data.altSeason! >= 65
                  ? "text-emerald-400"
                  : data.altSeason! <= 35
                  ? "text-rose-400"
                  : "text-yellow-400"
              }`}
            >
              {data.altSeason?.toFixed(0)} — {data.altLabel}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
