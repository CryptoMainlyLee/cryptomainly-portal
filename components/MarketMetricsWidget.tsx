"use client";

import React, { useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────────
   Formatting helpers
──────────────────────────────────────────────────────────────────────────── */
const compactCurrency = (n?: number, digits = 2) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: digits,
      }).format(n);

const pct = (n?: number, digits = 1) => (n == null ? "—" : `${n.toFixed(digits)} %`);
const pctFromUnit = (u?: number, digits = 4) =>
  u == null ? "—" : `${(u * 100).toFixed(digits)}%`;

const arrowColourByChange = (curr: number | null, prev: number | null) => {
  if (curr == null || prev == null) return { arrow: "", colour: "text-white/80" };
  if (curr > prev) return { arrow: "▲", colour: "text-emerald-400" };
  if (curr < prev) return { arrow: "▼", colour: "text-red-400" };
  return { arrow: "", colour: "text-white/80" };
};

const arrowColourBySign = (curr: number | null, prev: number | null) => {
  // Funding rate: colour reflects sign; arrow reflects change vs previous
  const signColour =
    curr == null ? "text-white/80" : curr > 0 ? "text-emerald-400" : curr < 0 ? "text-red-400" : "text-white/60";
  if (curr == null || prev == null) return { arrow: "", colour: signColour };
  const arrow = curr > prev ? "▲" : curr < prev ? "▼" : "";
  return { arrow, colour: signColour };
};

const fearGreedBadge = (value?: number, label?: string) => {
  if (value == null) return <span>—</span>;
  let emoji = "😐";
  let colour = "text-white";
  let implied = label || "";

  if (value >= 80) { emoji = "🤑"; colour = "text-yellow-400"; implied ||= "Extreme Greed"; }
  else if (value >= 60) { emoji = "😎"; colour = "text-emerald-400"; implied ||= "Greed"; }
  else if (value >= 40) { emoji = "😐"; colour = "text-blue-400"; implied ||= "Neutral"; }
  else if (value >= 20) { emoji = "😟"; colour = "text-orange-400"; implied ||= "Fear"; }
  else { emoji = "😱"; colour = "text-red-400"; implied ||= "Extreme Fear"; }

  return (
    <span className={`font-semibold ${colour}`}>
      {emoji} {value} <span className="text-white/60">{implied ? ` ${implied}` : ""}</span>
    </span>
  );
};

/* Sticky setter: once a value is non-null, never regress to null/undefined */
const stickySet =
  <T,>(setter: React.Dispatch<React.SetStateAction<T | null>>) =>
  (next: T | null | undefined, current: T | null) => {
    if (next === null || next === undefined) return; // ignore regressions
    if (Number.isNaN(next as any)) return;
    if (current === next) return;
    setter(next);
  };

/* ────────────────────────────────────────────────────────────────────────────
   Component
──────────────────────────────────────────────────────────────────────────── */
export default function MarketMetricsWidget() {
  /** ORIGINAL METRICS (kept) */
  const [domBTC, _setDomBTC] = useState<number | null>(null);
  const [domETH, _setDomETH] = useState<number | null>(null);
  const [mcap, _setMcap] = useState<number | null>(null);
  const [vol24h, _setVol24h] = useState<number | null>(null);
  const [fngValue, _setFngValue] = useState<number | null>(null);
  const [fngLabel, setFngLabel] = useState<string>("");

  const setDomBTC = (v: number | null | undefined) => stickySet(_setDomBTC)(v, domBTC);
  const setDomETH = (v: number | null | undefined) => stickySet(_setDomETH)(v, domETH);
  const setMcap = (v: number | null | undefined) => stickySet(_setMcap)(v, mcap);
  const setVol24h = (v: number | null | undefined) => stickySet(_setVol24h)(v, vol24h);
  const setFngValue = (v: number | null | undefined) => stickySet(_setFngValue)(v, fngValue);

  /** NEW LIVE ROWS (BTC & ETH per metric) */
  const [oiBTC, setOiBTC] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [oiETH, setOiETH] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [frBTC, setFrBTC] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [frETH, setFrETH] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [lsBTC, setLsBTC] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [lsETH, setLsETH] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });

  /** Staleness / header hint control */
  const [lastOkGlobal, setLastOkGlobal] = useState<number>(() => Date.now());
  const [lastOkBinance, setLastOkBinance] = useState<number>(() => Date.now());

  /** Abort controllers (prevent overlapping fetches) */
  const globalAbort = useRef<AbortController | null>(null);
  const binanceAbort = useRef<AbortController | null>(null);

  /** Hydrate from session cache so reloads start populated */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cm_metrics_cache_proxy");
      if (raw) {
        const j = JSON.parse(raw);
        _setDomBTC(j.domBTC ?? null);
        _setDomETH(j.domETH ?? null);
        _setMcap(j.mcap ?? null);
        _setVol24h(j.vol24h ?? null);
        _setFngValue(j.fngValue ?? null);
        setFngLabel(j.fngLabel ?? "");
        setOiBTC(j.oiBTC ?? { curr: null, prev: null });
        setOiETH(j.oiETH ?? { curr: null, prev: null });
        setFrBTC(j.frBTC ?? { curr: null, prev: null });
        setFrETH(j.frETH ?? { curr: null, prev: null });
        setLsBTC(j.lsBTC ?? { curr: null, prev: null });
        setLsETH(j.lsETH ?? { curr: null, prev: null });
        setLastOkGlobal(j.lastOkGlobal ?? Date.now());
        setLastOkBinance(j.lastOkBinance ?? Date.now());
      }
    } catch {}
  }, []);

  /** Persist cache */
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "cm_metrics_cache_proxy",
        JSON.stringify({
          domBTC, domETH, mcap, vol24h, fngValue, fngLabel,
          oiBTC, oiETH, frBTC, frETH, lsBTC, lsETH,
          lastOkGlobal, lastOkBinance,
        })
      );
    } catch {}
  }, [
    domBTC, domETH, mcap, vol24h, fngValue, fngLabel,
    oiBTC, oiETH, frBTC, frETH, lsBTC, lsETH,
    lastOkGlobal, lastOkBinance,
  ]);

  /** Fetch ORIGINAL block — via local API proxies (/api/metrics/global, /api/metrics/fng) */
  const fetchOriginal = async () => {
    try {
      globalAbort.current?.abort();
      const ac = new AbortController();
      globalAbort.current = ac;

      const [g, f] = await Promise.all([
        fetch("/api/metrics/global", { cache: "no-store", signal: ac.signal }).then((r) => r.json()),
        fetch("/api/metrics/fng", { cache: "no-store", signal: ac.signal }).then((r) => r.json()),
      ]);

      if (g?.ok) {
        setDomBTC(g.btcDom);
        setDomETH(g.ethDom);
        setMcap(g.mcap);
        setVol24h(g.vol24h);
        if (!g.stale) setLastOkGlobal(Date.now());
      }
      if (f?.ok) {
        setFngValue(f.value);
        if (f.label) setFngLabel(f.label);
        if (!f.stale) setLastOkGlobal(Date.now());
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      // keep last good values
    }
  };

  /** Fetch Binance rows — via local API proxy (/api/metrics/binance) */
  const fetchBinance = async () => {
    try {
      binanceAbort.current?.abort();
      const ac = new AbortController();
      binanceAbort.current = ac;

      const read = (s: string, m: "oi" | "fr" | "ls") =>
        fetch(`/api/metrics/binance?symbol=${s}&metric=${m}`, {
          cache: "no-store",
          signal: ac.signal,
        }).then((r) => r.json());

      const [btcOI, ethOI, btcFR, ethFR, btcLS, ethLS] = await Promise.all([
        read("BTCUSDT", "oi"),
        read("ETHUSDT", "oi"),
        read("BTCUSDT", "fr"),
        read("ETHUSDT", "fr"),
        read("BTCUSDT", "ls"),
        read("ETHUSDT", "ls"),
      ]);

      if (btcOI?.ok) setOiBTC({ prev: btcOI.prev, curr: btcOI.curr });
      if (ethOI?.ok) setOiETH({ prev: ethOI.prev, curr: ethOI.curr });
      if (btcFR?.ok) setFrBTC({ prev: btcFR.prev, curr: btcFR.curr });
      if (ethFR?.ok) setFrETH({ prev: ethFR.prev, curr: ethFR.curr });
      if (btcLS?.ok) setLsBTC({ prev: btcLS.prev, curr: btcLS.curr });
      if (ethLS?.ok) setLsETH({ prev: ethLS.prev, curr: ethLS.curr });

      const anyFresh = [btcOI, ethOI, btcFR, ethFR, btcLS, ethLS].some((x: any) => x && x.ok && !x.stale);
      if (anyFresh) setLastOkBinance(Date.now());
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      // keep last good values
    }
  };

  /** Intervals (Binance 30s, Global/FNG 90s, staggered start) */
  useEffect(() => {
    fetchBinance();
    const t1 = setTimeout(fetchOriginal, 1000);
    const idB = setInterval(fetchBinance, 30_000);
    const idG = setInterval(fetchOriginal, 90_000);
    return () => {
      clearInterval(idB);
      clearInterval(idG);
      clearTimeout(t1);
      globalAbort.current?.abort();
      binanceAbort.current?.abort();
    };
  }, []);

  /** Show “catching up…” only if BOTH sources are stale for > 5 minutes */
  const now = Date.now();
  const showCatchingUp =
    now - lastOkGlobal > 5 * 60_000 && now - lastOkBinance > 5 * 60_000;

  return (
    <div className="w-[320px] max-w-[92vw] rounded-2xl bg-[#0b121a]/85 p-3 ring-1 ring-white/10 backdrop-blur font-sans text-[13px] leading-snug text-white/90">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold text-white/90">Market Metrics</div>
        <div className="text-[10px] text-white/60">
          Updated live
          {showCatchingUp && (
            <span className="ml-1 text-orange-300/70">• catching up…</span>
          )}
        </div>
      </div>

      {/* ORIGINAL BLOCK (unchanged layout) */}
      <ul className="space-y-2">
        <li className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <span className="flex items-center gap-2">
            <span className="text-[16px]">📊</span>
            <span className="font-medium text-white">BTC Dominance</span>
          </span>
          <span className="font-semibold text-white">{pct(domBTC ?? undefined, 1)}</span>
        </li>

        <li className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <span className="flex items-center gap-2">
            <span className="text-[16px]">💎</span>
            <span className="font-medium text-white">ETH Dominance</span>
          </span>
          <span className="font-semibold text-white">{pct(domETH ?? undefined, 1)}</span>
        </li>

        <li className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <span className="flex items-center gap-2">
            <span className="text-[16px]">🔥</span>
            <span className="font-medium text-white">Fear &amp; Greed</span>
          </span>
          <span className="text-[12px]">{fearGreedBadge(fngValue ?? undefined, fngLabel)}</span>
        </li>

        <li className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <span className="flex items-center gap-2">
            <span className="text-[16px]">💰</span>
            <span className="font-medium text-white">Total Market Cap</span>
          </span>
          <span className="font-semibold text-white">${compactCurrency(mcap ?? undefined)}</span>
        </li>

        <li className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <span className="flex items-center gap-2">
            <span className="text-[16px]">⚡</span>
            <span className="font-medium text-white">24 h Volume</span>
          </span>
          <span className="font-semibold text-white">${compactCurrency(vol24h ?? undefined)}</span>
        </li>
      </ul>

      {/* ADDED LIVE ROWS (grouped by metric) */}
      <ul className="mt-3 space-y-1.5">
        {/* Open Interest */}
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="text-[14px]">📈</span>
            <span className="text-white">Open Interest</span>
          </span>
          <span className="text-[12px]">
            {(() => {
              const a = arrowColourByChange(oiBTC.curr, oiBTC.prev);
              return (
                <>
                  <span className="text-white/60 mr-1">BTC</span>
                  <span className={`font-semibold ${a.colour}`}>
                    {a.arrow && <span className="mr-1">{a.arrow}</span>}
                    ${compactCurrency(oiBTC.curr ?? undefined)}
                  </span>
                </>
              );
            })()}
            <span className="mx-2 text-white/20">|</span>
            {(() => {
              const a = arrowColourByChange(oiETH.curr, oiETH.prev);
              return (
                <>
                  <span className="text-white/60 mr-1">ETH</span>
                  <span className={`font-semibold ${a.colour}`}>
                    {a.arrow && <span className="mr-1">{a.arrow}</span>}
                    ${compactCurrency(oiETH.curr ?? undefined)}
                  </span>
                </>
              );
            })()}
          </span>
        </li>

        {/* Funding Rate */}
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="text-[14px]">💸</span>
            <span className="text-white">Funding Rate</span>
          </span>
          <span className="text-[12px]">
            {(() => {
              const a = arrowColourBySign(frBTC.curr, frBTC.prev);
              return (
                <>
                  <span className="text-white/60 mr-1">BTC</span>
                  <span className={`font-semibold ${a.colour}`}>
                    {a.arrow && <span className="mr-1">{a.arrow}</span>}
                    {pctFromUnit(frBTC.curr ?? undefined)}
                  </span>
                </>
              );
            })()}
            <span className="mx-2 text-white/20">|</span>
            {(() => {
              const a = arrowColourBySign(frETH.curr, frETH.prev);
              return (
                <>
                  <span className="text-white/60 mr-1">ETH</span>
                  <span className={`font-semibold ${a.colour}`}>
                    {a.arrow && <span className="mr-1">{a.arrow}</span>}
                    {pctFromUnit(frETH.curr ?? undefined)}
                  </span>
                </>
              );
            })()}
          </span>
        </li>

        {/* Long / Short Ratio */}
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="text-[14px]">📊</span>
            <span className="text-white">Long / Short Ratio</span>
          </span>
          <span className="text-[12px]">
            {(() => {
              const a = arrowColourByChange(lsBTC.curr, lsBTC.prev);
              return (
                <>
                  <span className="text-white/60 mr-1">BTC</span>
                  <span className={`font-semibold ${a.colour}`}>
                    {a.arrow && <span className="mr-1">{a.arrow}</span>}
                    {lsBTC.curr == null ? "—" : lsBTC.curr.toFixed(2)}
                  </span>
                </>
              );
            })()}
            <span className="mx-2 text-white/20">|</span>
            {(() => {
              const a = arrowColourByChange(lsETH.curr, lsETH.prev);
              return (
                <>
                  <span className="text-white/60 mr-1">ETH</span>
                  <span className={`font-semibold ${a.colour}`}>
                    {a.arrow && <span className="mr-1">{a.arrow}</span>}
                    {lsETH.curr == null ? "—" : lsETH.curr.toFixed(2)}
                  </span>
                </>
              );
            })()}
          </span>
        </li>

        {/* Mirror Fear & Greed */}
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="text-[14px]">😎</span>
            <span className="text-white">Fear &amp; Greed</span>
          </span>
          <span className="text-[12px]">{fearGreedBadge(fngValue ?? undefined, fngLabel)}</span>
        </li>
      </ul>

      {/* Footer credits */}
      <div className="mt-3 border-t border-white/10 pt-2 text-center text-[11px] leading-snug">
        <span className="text-white/60">Data provided by </span>
        <a
          className="text-[#00ff7f] hover:underline font-medium"
          target="_blank"
          rel="noreferrer"
          href="https://www.coinglass.com/"
        >
          Coinglass
        </a>
        <span className="text-white/40"> / </span>
        <a
          className="text-[#00ff7f] hover:underline font-medium"
          target="_blank"
          rel="noreferrer"
          href="https://alternative.me/crypto/fear-and-greed-index/"
        >
          Alternative.me
        </a>
        <div className="mt-1 text-[10px] text-white/45">
          Additional live pairs via{" "}
          <a
            className="text-[#00ff7f] hover:underline font-medium"
            target="_blank"
            rel="noreferrer"
            href="https://www.binance.com/en/futures-api"
          >
            Binance
          </a>
        </div>
      </div>
    </div>
  );
}
