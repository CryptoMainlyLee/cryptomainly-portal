"use client";

import { useEffect, useState } from "react";

type GlobalStats = {
  coins: number | null;
  exchanges: number | null;
  mcap: number | null;
  vol24h: number | null;
  btcDom: number | null;
  ethDom: number | null;
  mcapChange24h: number | null;
};

const formatCount = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(n);

const formatMoney = (n: number | null) => {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} M`;
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;
};

const formatPct = (n: number | null, digits = 1) =>
  n == null ? "—" : `${n.toFixed(digits)} %`;

export default function GlobalMarketBar({ refreshMs = 90_000 }: { refreshMs?: number }) {
  const [g, setG] = useState<GlobalStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const load = async () => {
      try {
        const res = await fetch("/api/metrics/global", { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        if (!d?.ok || cancelled) return;

        setG({
          coins: d.coins ?? null,
          exchanges: d.exchanges ?? null,
          mcap: d.mcap ?? null,
          vol24h: d.vol24h ?? null,
          btcDom: d.btcDom ?? null,
          ethDom: d.ethDom ?? null,
          mcapChange24h: d.mcapChange24h ?? null,
        });
      } catch {
        // Keep the last good snapshot on transient network/upstream errors.
      }
    };

    load();
    timer = setInterval(load, refreshMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [refreshMs]);

  const change = g?.mcapChange24h ?? null;

  return (
    <div className="mt-6 mb-3 rounded-xl bg-white/5 px-4 py-2 text-[12px] leading-6 text-white/80 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span>Coins: <span className="text-white/90">{formatCount(g?.coins ?? null)}</span></span>
        <span>Exchanges: <span className="text-white/90">{formatCount(g?.exchanges ?? null)}</span></span>
        <span>
          Market Cap: <span className="text-white/90">{formatMoney(g?.mcap ?? null)}</span>{" "}
          {change != null && (
            <span className={change >= 0 ? "text-green-400" : "text-red-400"}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)} %
            </span>
          )}
        </span>
        <span>24 h Vol: <span className="text-white/90">{formatMoney(g?.vol24h ?? null)}</span></span>
        <span>
          Dominance: <span className="text-white/90">BTC {formatPct(g?.btcDom ?? null)} • ETH {formatPct(g?.ethDom ?? null)}</span>
        </span>
      </div>
    </div>
  );
}
