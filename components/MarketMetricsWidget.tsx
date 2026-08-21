// app/components/MarketMetricsWidget.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

/* ───────────────── helpers ───────────────── */
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

/* “sticky” setter: never regress to null once we have a value */
const stickySet =
  <T,>(setter: React.Dispatch<React.SetStateAction<T | null>>) =>
  (next: T | null | undefined, current: T | null) => {
    if (next === null || next === undefined) return;
    if (Number.isNaN(next as any)) return;
    if (current === next) return;
    setter(next);
  };

const updatePair = (
  setter: React.Dispatch<
    React.SetStateAction<{ curr: number | null; prev: number | null }>
  >,
  next: number | null | undefined
) => {
  if (next === null || next === undefined || !Number.isFinite(next)) return;
  setter((current) =>
    current.curr === next ? current : { prev: current.curr, curr: next }
  );
};

/* ─────────────── component ─────────────── */
export default function MarketMetricsWidget() {
  // ORIGINAL rows
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

  // BTC/ETH derivatives rows
  const [oiBTC, setOiBTC] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [oiETH, setOiETH] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [frBTC, setFrBTC] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [frETH, setFrETH] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [lsBTC, setLsBTC] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });
  const [lsETH, setLsETH] = useState<{ curr: number | null; prev: number | null }>({ curr: null, prev: null });

  // stale flags for tiny “catching up…” hint
  const [lastOkGlobal, setLastOkGlobal] = useState<number>(() => Date.now());
  const [lastOkDerivatives, setLastOkDerivatives] = useState<number>(() => Date.now());

  // abort overlap fetches
  const globalAbort = useRef<AbortController | null>(null);
  const derivativesAbort = useRef<AbortController | null>(null);

  // hydrate from session cache so reloads don’t flash empty
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cm_metrics_cache_proxy_v2");
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
        setLastOkDerivatives(j.lastOkDerivatives ?? Date.now());
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "cm_metrics_cache_proxy_v2",
        JSON.stringify({
          domBTC, domETH, mcap, vol24h, fngValue, fngLabel,
          oiBTC, oiETH, frBTC, frETH, lsBTC, lsETH,
          lastOkGlobal, lastOkDerivatives,
        })
      );
    } catch {}
  }, [
    domBTC, domETH, mcap, vol24h, fngValue, fngLabel,
    oiBTC, oiETH, frBTC, frETH, lsBTC, lsETH,
    lastOkGlobal, lastOkDerivatives,
  ]);

  /* ─────────── data fetch (minimal changes + fallbacks) ─────────── */

  // 1) Global + FNG (try /api/metrics/*, fall back to your original /api/cg/* + /api/sentiment)
  const fetchOriginal = async () => {
    try {
      globalAbort.current?.abort();
      const ac = new AbortController();
      globalAbort.current = ac;

      // first try the “metrics” proxies if present
      let g: any = null;
      let f: any = null;

      try {
        [g, f] = await Promise.all([
          fetch("/api/metrics/global", { cache: "no-store", signal: ac.signal }).then(r => r.ok ? r.json() : null),
          fetch("/api/metrics/fng",    { cache: "no-store", signal: ac.signal }).then(r => r.ok ? r.json() : null),
        ]);
      } catch { /* ignore, we have fallbacks below */ }

      // fallback to your existing routes
      if (!g) {
        try { g = await fetch("/api/cg/global", { cache: "no-store", signal: ac.signal }).then(r => r.ok ? r.json() : null); } catch {}
      }
      if (!f) {
        try { f = await fetch("/api/sentiment", { cache: "no-store", signal: ac.signal }).then(r => r.ok ? r.json() : null); } catch {}
      }

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
    }
  };

  // 2) BTC/ETH derivatives via the existing futures API route, now backed by Bitget public data.
  //    Binance is deliberately not used here.
  const fetchDerivatives = async () => {
    try {
      derivativesAbort.current?.abort();
      const ac = new AbortController();
      derivativesAbort.current = ac;

      const d = await fetch("/api/metrics/futures", {
        cache: "no-store",
        signal: ac.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      if (d?.ok) {
        updatePair(setOiBTC, d.btc?.oiUsd);
        updatePair(setOiETH, d.eth?.oiUsd);
        updatePair(setFrBTC, d.btc?.fundingRate);
        updatePair(setFrETH, d.eth?.fundingRate);
        updatePair(setLsBTC, d.btc?.longShortRatio);
        updatePair(setLsETH, d.eth?.longShortRatio);
        if (!d.stale) setLastOkDerivatives(Date.now());
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    }
  };

  // Derivatives refresh every 60s; global/F&G every 90s.
  useEffect(() => {
    fetchDerivatives();
    const t1 = setTimeout(fetchOriginal, 1000);
    const idD = setInterval(fetchDerivatives, 60_000);
    const idG = setInterval(fetchOriginal, 90_000);
    return () => {
      clearInterval(idD); clearInterval(idG); clearTimeout(t1);
      globalAbort.current?.abort(); derivativesAbort.current?.abort();
    };
  }, []);

  const now = Date.now();
  const showCatchingUp =
    now - lastOkGlobal > 5 * 60_000 && now - lastOkDerivatives > 5 * 60_000;

  /* ─────────────── render ─────────────── */
  return (
    <div className="w-[320px] max-w-[92vw] rounded-2xl bg-[#0b121a]/85 p-3 ring-1 ring-white/10 backdrop-blur font-sans text-[13px] leading-snug text-white/90">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold text-white/90">Market Metrics</div>
        <div className="text-[10px] text-white/60">
          Updated live
          {showCatchingUp && <span className="ml-1 text-orange-300/70">• catching up…</span>}
        </div>
      </div>

      {/* ORIGINAL block (unchanged layout) */}
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

      {/* BTC/ETH derivatives rows */}
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

        {/* Mirror F&G for quick scan */}
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="text-[14px]">😎</span>
            <span className="text-white">Fear &amp; Greed</span>
          </span>
          <span className="text-[12px]">{fearGreedBadge(fngValue ?? undefined, fngLabel)}</span>
        </li>
      </ul>

      {/* Footer credits (as before) */}
      <div className="mt-3 border-t border-white/10 pt-2 text-center text-[11px] leading-snug">
        <span className="text-white/60">Market data links: </span>
        <a className="text-[#00ff7f] hover:underline font-medium" target="_blank" rel="noreferrer" href="https://www.coinglass.com/">
          Coinglass
        </a>
        <span className="text-white/40"> / </span>
        <a className="text-[#00ff7f] hover:underline font-medium" target="_blank" rel="noreferrer" href="https://alternative.me/crypto/fear-and-greed-index/">
          Alternative.me
        </a>
        <div className="mt-1 text-[10px] text-white/45">
          Derivatives via{" "}
          <a className="text-[#00ff7f] hover:underline font-medium" target="_blank" rel="noreferrer" href="https://www.bitget.com/">
            Bitget
          </a>
        </div>
      </div>
    </div>
  );
}
