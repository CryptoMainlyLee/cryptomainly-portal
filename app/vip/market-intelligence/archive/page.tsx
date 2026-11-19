import type { Metadata } from "next";
import Image from "next/image";
import "../market-intelligence.css";
import { publicEditions } from "../../../_mi/public-editions";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Research Archive | CryptoMainly",
  description: "Browse dated CryptoMainly Market Intelligence editions and their original source links.",
  robots: { index: false, follow: false },
};

type SearchParams = { q?: string | string[]; market?: string | string[]; date?: string | string[] };
function param(v: string | string[] | undefined) {
  return typeof v === "string" ? v.trim().slice(0,160) : "";
}
export default async function ResearchArchiveIndex({ searchParams }: {searchParams?: SearchParams}) {
  const allEditions = await publicEditions();
  const LATEST_RESEARCH_EDITION = allEditions[0];
  const q = param(searchParams?.q);
  const market = param(searchParams?.market);
  const date = param(searchParams?.date);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = allEditions.filter(e => !date || e.slug === date).map(edition => {
    const observations = edition.observations.filter(item => {
      if (market && market !== item.category) return false;
      const haystack = [edition.slug,edition.displayDate,item.symbol,item.asset,item.authorHandle,item.source,item.category,item.title,item.summary,item.type,item.timeframe,item.pattern_or_anomaly].filter(Boolean).join(" ").toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
    return { ...edition, matches: observations };
  }).filter(e => e.matches.length > 0);
  const searching = Boolean(q || market || date);
  const totalMatches = filtered.reduce((sum,e) => sum+e.matches.length,0);
  return (
    <div className="mi-site">
      <div className="mi-glow" aria-hidden />
      <header className="mi-topbar">
        <div className="mi-shell mi-top-inner">
          <a className="mi-logo" href="/">
            <Image src="/assets/coin-gold.png" alt="CryptoMainly" width={48} height={48} unoptimized />
            <span><b>CryptoMainly</b><small>RESEARCH ARCHIVE</small></span>
          </a>
          <nav className="mi-nav" aria-label="Research navigation">
            <a className="mi-return" href="/vip/market-intelligence">← Latest research</a>
          </nav>
        </div>
      </header>
      <main className="mi-shell">
        <section className="mi-hero">
          <p className="mi-kicker">CryptoMainly research library</p>
          <h1>Research <span>Archive</span></h1>
          <p className="mi-archive-intro">
            Revisit earlier market perspectives with their original chart links, editorial
            summaries and source dates. These reports reflect what researchers discussed
            when each edition was published, not current trading opportunities.
          </p>
          <div className="mi-edition-navigation">
            <a href="/vip/market-intelligence">View latest research →</a>
          </div>
        </section>
        <form method="get" action="/vip/market-intelligence/archive" className="mi-archive-search">
          <label>Search all published research
            <input name="q" type="search" defaultValue={q} maxLength={160} placeholder="Asset, ticker, analyst, pattern or keyword" />
          </label>
          <label>Market
            <select name="market" defaultValue={market}>
              <option value="">All markets</option><option value="crypto">Crypto</option>
              <option value="stocks">Stocks</option><option value="macro">Historical macro</option>
            </select>
          </label>
          <label>Edition date
            <select name="date" defaultValue={date}>
              <option value="">All dates</option>
              {allEditions.map(e => <option key={e.slug} value={e.slug}>{e.displayDate}</option>)}
            </select>
          </label>
          <button type="submit">Search</button>
          {searching && <a href="/vip/market-intelligence/archive">Clear filters</a>}
        </form>
        <div className="mi-section-heading">
          <h2>{searching ? "Matching editions" : "Published editions"}</h2>
          <span>{filtered.length} {filtered.length === 1 ? "edition" : "editions"} · {totalMatches} observations</span>
        </div>
        <p className="mi-archive-count">
          New dated editions will appear here after editorial review and publication.
          Archive links stay unchanged when the latest research is updated.
        </p>
        <div className="mi-archive-entries">
          {filtered.length === 0 && <p role="status">No public research matches your search.</p>}
          {filtered.map((edition) => (
            <article key={edition.slug} className="mi-archive-entry">
              <span className="mi-archive-date">{edition.displayDate}</span>
              <h2>{edition.summary}</h2>
              <p>{edition.observations.length} source-linked observations. Research recorded for this date only.</p>
              {searching && <ul className="mi-archive-matches">{edition.matches.map(item => <li key={item.id}>{item.symbol} · {item.title} · {item.source}</li>)}</ul>}
              <span className="mi-archive-tags">
                {edition.highlights.join(" · ")}
                {edition.slug === LATEST_RESEARCH_EDITION?.slug ? " · Current edition" : ""}
              </span>
              <a href={"/vip/market-intelligence/archive/" + edition.slug}>Open this edition ↗</a>
            </article>
          ))}
        </div>
        <aside className="mi-disclaimer">
          <div>
            <strong>Historical research, not live trading signals</strong>
            <p>Charts and commentary may become outdated. Publication dates and original X sources are preserved to provide context, not to suggest a current entry or exit.</p>
          </div>
          <a href="/vip/market-intelligence">Latest Research ↗</a>
        </aside>
      </main>
      <footer className="mi-footer"><div className="mi-shell">© 2026 CryptoMainly · Research archive</div></footer>
    </div>
  );
}
