"use client";

import { useEffect, useState } from "react";

type GlobalStats = {
  coins: number;
  markets: number;
  marketCap: number;
  vol24h: number;
  btcDom: number;
  ethDom: number;
  mcChange24h: number;
};

function num(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}
function money(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  return `$${num(n)}`;
}

export default function GlobalMarketBar({ refreshMs = 60000 }: { refreshMs?: number }) {
  const [g, setG] = useState<GlobalStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let timer: any;
    const load = async () => {
      try {
        setErr(null);
        // ✅ use the internal proxy route for reliability (no CORS / API limits)
        const res = await fetch("/api/cg/global", { cache: "no-store" });
        if (!res.ok) throw new Error("network");
        const d = await res.json();

        // ✅ updated mapping to match our proxy route’s flattened data structure
        const out: GlobalStats = {
          coins: d.coins ?? 0,
          markets: d.markets ?? 0,
          marketCap: d.marketCap ?? 0,
          vol24h: d.vol24h ?? 0,
          btcDom: d.btcDom ?? 0,
          ethDom: d.ethDom ?? 0,
          mcChange24h: d.mcChange24h ?? 0,
        };

        setG(out);
      } catch {
        setErr("failed to fetch");
      }
    };
    load();
    timer = setInterval(load, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);

  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs md:text-[13px] text-white/80 flex flex-wrap gap-x-6 gap-y-2">
      {g ? (
        <>
          <span>Coins: <span className="text-white">{num(g.coins)}</span></span>
          <span>Exchanges: <span className="text-white">{num(g.markets)}</span></span>
          <span>
            Market Cap: <span className="text-white">{money(g.marketCap)}</span>{" "}
            <span className={g.mcChange24h >= 0 ? "text-green-400" : "text-red-400"}>
              {g.mcChange24h >= 0 ? "▲" : "▼"} {Math.abs(g.mcChange24h).toFixed(2)}%
            </span>
          </span>
          <span>24h Vol: <span className="text-white">{money(g.vol24h)}</span></span>
          <span>Dominance: <span className="text-white">BTC {g.btcDom.toFixed(1)}% · ETH {g.ethDom.toFixed(1)}%</span></span>
        </>
      ) : (
        <span className="opacity-70">{err ?? "Loading..."}</span>
      )}
    </div>
  );
}
