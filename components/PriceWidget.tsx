"use client";

import React, { useEffect, useRef, useState } from "react";

type Row = {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  change24h: number | null;
  ts: number;
};

const COIN_EMOJI: Record<string, string> = {
  BTC: "🟠", ETH: "💎", XRP: "💠", BNB: "🟡", SOL: "🟣",
  DOGE: "🐶", TRX: "🔻", ADA: "🔷", LINK: "🔗", LTC: "⚪",
};

const ICON_CACHE_KEY = "cm_prices_icons_v1";
const ICON_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const toFixedSmart = (n: number | null) => {
  if (n == null) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100)  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
};

const pctColour = (v: number | null) =>
  v == null ? "text-white/70" : v >= 0 ? "text-emerald-400" : "text-red-400";

const sign = (v: number | null) =>
  v == null ? "" : v >= 0 ? "▲" : "▼";

const stickyMerge = (prev: Row[], next: Row[]) => {
  if (!prev?.length) return next;
  const byId = Object.fromEntries(prev.map((r) => [r.id, r]));
  return next.map((n) => {
    const p = byId[n.id];
    if (!p) return n;
    return {
      ...n,
      price: n.price ?? p.price,
      change24h: n.change24h ?? p.change24h,
      ts: n.ts || p.ts,
    };
  });
};

/** Load icon cache (urls keyed by CoinGecko id) from sessionStorage if fresh */
function loadIconCache(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(ICON_CACHE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return {};
    if (!j.ts || !j.map) return {};
    if (Date.now() - j.ts > ICON_CACHE_TTL_MS) return {};
    return j.map as Record<string, string>;
  } catch {
    return {};
  }
}

/** Save icon cache */
function saveIconCache(map: Record<string, string>) {
  try {
    sessionStorage.setItem(ICON_CACHE_KEY, JSON.stringify({ ts: Date.now(), map }));
  } catch {}
}

export default function PriceWidget() {
  const [rows, setRows] = useState<Row[]>([]);
  const [lastOk, setLastOk] = useState<number>(() => Date.now());
  const [iconMap, setIconMap] = useState<Record<string, string>>(() => loadIconCache());

  const abortRef = useRef<AbortController | null>(null);
  const iconAbortRef = useRef<AbortController | null>(null);
  const iconFetchScheduledRef = useRef(false);

  // hydrate from cache
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cm_prices_cache_v1");
      if (raw) {
        const j = JSON.parse(raw);
        setRows(j.rows || []);
        setLastOk(j.lastOk || Date.now());
      }
    } catch {}
  }, []);

  // persist cache (prices)
  useEffect(() => {
    try {
      sessionStorage.setItem("cm_prices_cache_v1", JSON.stringify({ rows, lastOk }));
    } catch {}
  }, [rows, lastOk]);

  // persist cache (icons)
  useEffect(() => {
    saveIconCache(iconMap);
  }, [iconMap]);

  const fetchPrices = async () => {
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const res = await fetch("/api/prices", { cache: "no-store", signal: ac.signal });
      const j = await res.json();

      if (j?.ok && Array.isArray(j.rows)) {
        setRows((prev) => stickyMerge(prev, j.rows));
        if (!j.stale) setLastOk(Date.now());
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      // keep last values
    }
  };

  // Debounced icon fetcher: hits CoinGecko once, caches for 12h
  const fetchIconsOnce = async (ids: string[]) => {
    if (!ids.length) return;
    if (iconFetchScheduledRef.current) return; // prevent spam
    iconFetchScheduledRef.current = true;
    setTimeout(async () => {
      try {
        iconAbortRef.current?.abort();
        const ac = new AbortController();
        iconAbortRef.current = ac;

        // Only fetch missing ids (not already in cache)
        const missing = ids.filter((id) => !iconMap[id]);
        if (!missing.length) { iconFetchScheduledRef.current = false; return; }

        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
          missing.join(",")
        )}&price_change_percentage=24h&per_page=${missing.length}&page=1`;
        const res = await fetch(url, { cache: "no-store", signal: ac.signal });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const arr = await res.json();

        const next: Record<string, string> = { ...iconMap };
        for (const it of arr || []) {
          const id = it?.id;
          const img: string | undefined = it?.image;
          if (id && img && typeof img === "string") {
            next[id] = img;
          }
        }
        setIconMap(next);
      } catch {
        // silent fail; we’ll try again next reload/interval
      } finally {
        iconFetchScheduledRef.current = false;
      }
    }, 300); // tiny debounce to avoid immediate double-calls
  };

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, 45_000);
    return () => { clearInterval(id); abortRef.current?.abort(); };
  }, []);

  // Whenever rows update, attempt to fetch missing icons (if cache is empty/stale)
  useEffect(() => {
    const ids = rows.map((r) => r.id);
    if (ids.length) fetchIconsOnce(ids);
    return () => { iconAbortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const now = Date.now();
  const showCatchingUp = now - lastOk > 5 * 60_000; // 5m

  return (
    <aside className="w-[320px] max-w-[92vw] rounded-2xl bg-[#0b121a]/90 p-3 ring-1 ring-white/10 backdrop-blur font-sans text-[13px] leading-snug text-white/90">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold text-white/90">Live Crypto Prices</div>
        <div className="text-[10px] text-white/60">
          Data: <span className="text-white/80">CoinGecko</span>
          {showCatchingUp && <span className="ml-1 text-orange-300/70">• catching up…</span>}
        </div>
      </div>

      {/* List */}
      <ul className="divide-y divide-white/10 rounded-xl overflow-hidden ring-1 ring-white/10">
        {rows.map((r) => {
          const color = pctColour(r.change24h);
          const sgn = sign(r.change24h);
          const iconUrl = iconMap[r.id];
          return (
            <li key={r.id} className="flex items-center justify-between bg-white/[0.03] px-3 py-2">
              <a
                href={`https://www.coingecko.com/en/coins/${r.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 hover:underline"
                title={`Open ${r.name} on CoinGecko`}
              >
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={`${r.name} logo`}
                    className="h-5 w-5 rounded-full ring-1 ring-white/10 object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="text-[16px]">{COIN_EMOJI[r.symbol] || "🪙"}</span>
                )}
                <span className="font-semibold text-white">{r.symbol}</span>
                <span className="text-white/60">{r.name}</span>
              </a>
              <div className="flex items-center gap-3">
                <span className="font-semibold">${toFixedSmart(r.price)}</span>
                <span className={`text-[12px] font-semibold ${color}`}>
                  {sgn && <span className="mr-1">{sgn}</span>}
                  {r.change24h == null ? "—" : Math.abs(r.change24h).toFixed(2) + " %"}
                </span>
              </div>
            </li>
          );
        })}
        {!rows.length && (
          <li className="px-3 py-4 text-center text-white/60">Loading prices…</li>
        )}
      </ul>

      {/* Search */}
      <form
        className="mt-3 flex items-center gap-2"
        action="https://www.coingecko.com/en/coins"
        method="GET"
        onSubmit={(e) => {
          e.preventDefault();
          const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement)?.value?.trim();
          const url = q
            ? `https://www.coingecko.com/en/search?query=${encodeURIComponent(q)}`
            : "https://www.coingecko.com/";
          window.open(url, "_blank");
        }}
      >
        <input
          name="q"
          placeholder="Search on CoinGecko…"
          className="flex-1 rounded-xl bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
        />
        <button
          type="submit"
          className="rounded-xl bg-white/10 px-3 py-2 text-[12px] font-semibold ring-1 ring-white/10 hover:bg-white/15"
        >
          Search
        </button>
      </form>

      {/* Footer */}
      <div className="mt-3 text-center text-[11px]">
        <span className="text-white/60">Data provided by </span>
        <a
          href="https://www.coingecko.com/"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-[#00ff7f] hover:underline"
        >
          CoinGecko
        </a>
      </div>
    </aside>
  );
}
