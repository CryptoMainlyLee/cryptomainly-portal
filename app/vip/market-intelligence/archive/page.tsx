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

export default async function ResearchArchiveIndex() {
  const RESEARCH_EDITIONS = await publicEditions();
  const LATEST_RESEARCH_EDITION = RESEARCH_EDITIONS[0];
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
        <div className="mi-section-heading">
          <h2>Published editions</h2>
          <span>{RESEARCH_EDITIONS.length} {RESEARCH_EDITIONS.length === 1 ? "edition" : "editions"}</span>
        </div>
        <p className="mi-archive-count">
          New dated editions will appear here after editorial review and publication.
          Archive links stay unchanged when the latest research is updated.
        </p>
        <div className="mi-archive-entries">
          {RESEARCH_EDITIONS.map((edition) => (
            <article key={edition.slug} className="mi-archive-entry">
              <span className="mi-archive-date">{edition.displayDate}</span>
              <h2>{edition.summary}</h2>
              <p>{edition.observations.length} source-linked observations. Research recorded for this date only.</p>
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
