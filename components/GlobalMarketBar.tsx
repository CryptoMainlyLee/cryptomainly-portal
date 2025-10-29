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
        // 🔸 minimal change: call our proxy
        const res = await fetch("/api/cg/global", { cache: "no-store" });
        const json = await res.json();

        // If proxy bubbled a soft error, keep old UI text
        const d = json?.data;
        if (!d) throw new Error("no-data");

        const out: GlobalStats = {
          coins: d?.active_cryptocurrencies ?? 0,
          markets: d?.markets ?? 0,
          marketCap: d?.total_market_cap?.usd ?? 0,
          vol24h: d?.total_volume?.usd ?? 0,
          btcDom: d?.market_cap_percentage?.btc ?? 0,
          ethDom: d?.market_cap_percentage?.eth ?? 0,
          mcChange24h: d?.market_cap_change_percentage_24h_usd ?? 0,
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
          <span>Market Cap: <span className="text-white">{money(g.marketCap)}</span>{" "}
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
