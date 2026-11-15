"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import "./market-intelligence.css";
import {
  MARKET_OBSERVATIONS,
  RESEARCH_EDITION_DATE,
  type MarketObservation,
  type MarketCategory,
} from "./observations";

declare global {
  interface Window {
    twttr?: { widgets?: { load: (root?: HTMLElement) => void } };
  }
}

type Filter = "all" | MarketCategory;

const categoryLabels: Record<Filter, string> = {
  all: "All topics",
  crypto: "Crypto",
  stocks: "Stocks",
  macro: "Macro",
};

function ChartIcon({ category }: { category: MarketCategory }) {
  // Own, decorative illustration. Real chart appears ONLY through an opt-in official X embed.
  const stroke = category === "crypto" ? "#fbbf24" : category === "stocks" ? "#5de1ad" : "#79bfff";
  const plot =
    category === "crypto"
      ? "6,68 32,58 55,78 78,45 102,51 125,30 153,46 174,24 204,45 224,36 255,57 292,36"
      : category === "stocks"
        ? "6,83 34,72 58,76 77,58 96,43 123,50 147,29 167,45 197,34 214,22 241,34 268,16 292,23"
        : "6,77 33,57 60,66 87,40 111,51 143,24 163,47 194,36 225,27 250,52 274,40 292,22";
  return (
    <svg role="img" aria-label="Decorative chart icon, not historical market data" viewBox="0 0 300 116" className="mi-chart-art">
      {[18, 44, 70, 96].map((y) => (
        <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,.11)" strokeWidth="1" strokeDasharray="3 6" />
      ))}
      <polyline points={plot} fill="none" stroke={stroke} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={plot + " 292,110 6,110"} fill={stroke} fillOpacity=".08" stroke="none" />
      <line x1="0" y1="111" x2="300" y2="111" stroke="rgba(255,255,255,.16)" />
    </svg>
  );
}

function XPostEmbed({ item, showAll, screenshot }: { item: MarketObservation; showAll: boolean; screenshot: boolean }) {
  const [selfEnabled, setSelfEnabled] = useState(false);
  const active = selfEnabled || showAll;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !rootRef.current) return;
    const root = rootRef.current;
    let cancelled = false;
    const load = () => {
      if (!cancelled && window.twttr?.widgets?.load) {
        window.twttr.widgets.load(root);
      }
    };
    if (window.twttr?.widgets) {
      load();
      return () => { cancelled = true; };
    }
    let script = document.querySelector<HTMLScriptElement>('script[data-mi-x-widgets]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.dataset.miXWidgets = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", load);
    return () => {
      cancelled = true;
      script?.removeEventListener("load", load);
    };
  }, [active]);

  return (
    <div className="mi-visual">
      {!active ? (
        <div className="mi-art-preview">
          <div className="mi-art-top">
            <span>CHART FROM ORIGINAL SOURCE</span>
            <span className="mi-art-tag">X EMBED AVAILABLE</span>
          </div>
          <ChartIcon category={item.category} />
          <div className="mi-art-bottom">
            <span>Decorative preview — not actual price data</span>
            {screenshot ? (
              <span className="mi-share-static">View the original chart on the dashboard ↗</span>
            ) : (
              <button
                type="button"
                className="mi-reveal"
                onClick={() => setSelfEnabled(true)}
                aria-label={"Load original X post with chart for " + item.title}
              >
                Load source chart ↗
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mi-x-embed">
          <div className="mi-x-frame" ref={rootRef}>
            <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true" data-cards="visible" data-conversation="none">
              <a href={item.url}>View original X post from @{item.authorHandle}</a>
            </blockquote>
          </div>
          <p className="mi-embed-note">
            Original X post, loaded by your choice. If blocked by browser privacy settings, use{" "}
            <a href={item.url} target="_blank" rel="noopener noreferrer">the direct source link</a>.
          </p>
        </div>
      )}
    </div>
  );
}

function ObservationCard({
  item,
  showAll,
  screenshot,
}: {
  item: MarketObservation;
  showAll: boolean;
  screenshot: boolean;
}) {
  return (
    <article className="mi-card" data-market={item.category} data-postid={item.id}>
      <div className="mi-card-topline">
        <span className={"mi-chip mi-" + item.category}>{item.categoryLabel}</span>
        <span className="mi-chart-type">{item.type}</span>
      </div>
      <XPostEmbed item={item} showAll={showAll && !screenshot} screenshot={screenshot} />
      <div className="mi-card-main">
        <p className="mi-asset">{item.symbol}</p>
        <h3>{item.title}</h3>
        <p className="mi-summary">{item.summary}</p>
        {!screenshot && (
          <div className="mi-why">
            <strong>Why it is interesting</strong>
            <p>{item.whyInteresting}</p>
            <strong>What still needs checking</strong>
            <p>{item.limitations}</p>
          </div>
        )}
        <div className="mi-card-footer">
          <span className="mi-source">
            <b>{item.source}</b>
            <small>{item.publishedDate} · Historic observation</small>
          </span>
          <a className="mi-original" href={item.url} target="_blank" rel="noopener noreferrer">
            Original X post ↗
          </a>
        </div>
      </div>
    </article>
  );
}

export default function MarketIntelligenceDashboard() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showAllCharts, setShowAllCharts] = useState(false);
  const [screenshot, setScreenshot] = useState(false);

  useEffect(() => {
    setScreenshot(new URLSearchParams(window.location.search).get("share") === "1");
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MARKET_OBSERVATIONS.filter((item) => {
      if (filter !== "all" && item.category !== filter) return false;
      if (!q) return true;
      return [
        item.title, item.symbol, item.source, item.categoryLabel, item.summary, item.type,
      ].join(" ").toLowerCase().includes(q);
    });
  }, [filter, search]);
  const shown = screenshot ? MARKET_OBSERVATIONS.slice(0, 4) : filtered;

  return (
    <div className={"mi-site" + (screenshot ? " mi-share-mode" : "")}>
      <div className="mi-glow" aria-hidden />
      {!screenshot && (
        <header className="mi-topbar">
          <div className="mi-shell mi-top-inner">
            <a className="mi-logo" href="/">
              <Image src="/assets/coin-gold.png" alt="CryptoMainly" width={48} height={48} unoptimized />
              <span><b>CryptoMainly</b><small>MARKET INTELLIGENCE</small></span>
            </a>
            <nav className="mi-nav" aria-label="Main navigation">
              <span className="mi-public-label">OPEN RESEARCH BOARD</span>
              <a href="/" className="mi-return">← Main portal</a>
            </nav>
          </div>
        </header>
      )}
      <main className="mi-shell">
        <section className="mi-hero">
          <p className="mi-kicker">CryptoMainly research · Public preview</p>
          <h1>Market <span>Intelligence</span></h1>
          <p className="mi-intro">
            Curated crypto, equities and macro observations from independent market researchers.
            Explore the original charts and choose the ideas worth investigating further.
          </p>
          <div className="mi-meta">
            <span>Research edition: {RESEARCH_EDITION_DATE}</span>
            <span className="mi-pill">Historic observations · Not live trade signals</span>
          </div>
        </section>

        {!screenshot && (
          <>
            <div className="mi-stats" aria-label="Research summary">
              <div><b>{MARKET_OBSERVATIONS.length}</b><span>Research observations</span></div>
              <div><b>3</b><span>Market categories</span></div>
              <div><b>0</b><span>Verified trade signals</span></div>
            </div>
            <div className="mi-section-heading">
              <h2>This edition&apos;s research</h2>
              <span>{filtered.length} observations</span>
            </div>
            <div className="mi-filterbar" aria-label="Filter research">
              {(["all", "crypto", "stocks", "macro"] as Filter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {categoryLabels[option]}
                </button>
              ))}
              <label className="mi-search">
                <span className="mi-sr-only">Search sources, assets and themes</span>
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sources, assets and themes…" />
              </label>
            </div>
            <div className="mi-embed-controls">
              <p>Original X chart images are available inside each card. Third-party X content only loads when you choose to view it.</p>
              <button type="button" onClick={() => setShowAllCharts(true)} disabled={showAllCharts}>
                {showAllCharts ? "Source charts enabled" : "Load all original X charts"}
              </button>
            </div>
          </>
        )}

        {screenshot && <p className="mi-snapshot-label">Research highlights · 4 selected discussions</p>}
        <div className="mi-grid" aria-label="Market observations">
          {shown.map((item) => (
            <ObservationCard item={item} key={item.id} showAll={showAllCharts} screenshot={screenshot} />
          ))}
        </div>
        {!screenshot && filtered.length === 0 && (
          <p className="mi-empty" role="status">No observations match this filter. Try another search.</p>
        )}
        <aside className="mi-disclaimer">
          <div>
            <strong>How to use this research</strong>
            <p>
              This is a dated selection of third-party opinions, not verified trading signals or personal financial advice.
              Technical patterns can fail, and the prices, claims and charts have not been independently validated.
              Original media remains with the publishers. Check market conditions and risk yourself before acting.
            </p>
          </div>
          {!screenshot && <a href="/">Back to CryptoMainly ↗</a>}
        </aside>
      </main>
      <footer className="mi-footer"><div className="mi-shell">
        © 2026 CryptoMainly · Open research preview · Curated source links
      </div></footer>
    </div>
  );
}
