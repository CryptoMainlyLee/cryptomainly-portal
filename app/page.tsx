"use client";

import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PriceWidget from "@/components/PriceWidget";
import MarketMetricsWidget from "@/components/MarketMetricsWidget";
import EmailCapture from "@/components/EmailCapture";

/* ───────────────── Chart Preview (top-left) with PIN + whitelist ───────────────── */
function ChartPreviewWidget() {
  const LS_KEY = "cm_chart_url";
  const SS_EDIT = "cm_chart_edit";
  const DEFAULT_SNAPSHOT_ID = "SjjTTtGZ"; // fallback for mobile so preview is never empty
  const [input, setInput] = useState<string>("");
  const [snapshotId, setSnapshotId] = useState<string>("");
  const [editEnabled, setEditEnabled] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Optional PIN (client-readable)
  const EDIT_PIN = process.env.NEXT_PUBLIC_CHART_PIN || "";

  // Pull last used link + edit state from storage
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : "";
    if (saved) {
      setInput(saved);
      const id = extractId(saved);
      setSnapshotId(id);
    }
    const edit = typeof window !== "undefined" ? sessionStorage.getItem(SS_EDIT) : "";
    if (edit === "1") setEditEnabled(true);
  }, []);

  // Parse TradingView snapshot link & build image url
  function extractId(url: string): string {
    // Strict whitelist: https://www.tradingview.com/x/<ID> (alphanumeric only)
    const m = url
      .trim()
      .match(/^https?:\/\/(?:www\.)?tradingview\.com\/x\/([A-Za-z0-9]+)\/?(?:\?.*)?$/i);
    return m?.[1] ?? "";
  }

  function handleChange(v: string) {
    setError("");
    setInput(v);
    const id = extractId(v);
    if (!id && v.trim().length > 0) {
      setError(
        "Invalid TradingView link. Use the 'Share → Copy link' snapshot format (https://www.tradingview.com/x/ID/)"
      );
    }
    setSnapshotId(id);
  }

  function unlock() {
    if (!EDIT_PIN) {
      setEditEnabled(true);
      sessionStorage.setItem(SS_EDIT, "1");
      return;
    }
    const entered = window.prompt("Enter PIN to edit chart link:") || "";
    if (entered === EDIT_PIN) {
      setEditEnabled(true);
      sessionStorage.setItem(SS_EDIT, "1");
    } else {
      alert("Incorrect PIN.");
    }
  }

  const id = snapshotId || extractId(input);
  const idToShow = id || DEFAULT_SNAPSHOT_ID;
  const imgUrl = `https://s3.tradingview.com/snapshots/${idToShow[0].toLowerCase()}/${idToShow}.png`;
  const tvUrl  = `https://www.tradingview.com/x/${idToShow}/`;

  return (
    <div className="w-[340px] rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-white/80">Chart Preview</div>
        <div className="flex items-center gap-2">
          {id ? (
            <Link
              href={tvUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              Open
            </Link>
          ) : null}

          {!editEnabled ? (
            <button
              onClick={unlock}
              className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
              title={EDIT_PIN ? "Locked (PIN required)" : "Locked"}
            >
              Edit
            </button>
          ) : (
            <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              Edit ✓
            </span>
          )}
        </div>
      </div>

      {/* Input (only visible in edit mode) */}
      {editEnabled && (
        <>
          <input
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Paste TradingView link e.g. https://www.tradingview.com/x/SjjTTtGZ/"
            spellCheck={false}
            className="mb-2 w-full rounded-lg bg-black/30 px-3 py-2 text-[13px] text-white/90 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-amber-400/50"
          />
          {error && <div className="mb-2 text-[11px] text-rose-300">{error}</div>}
        </>
      )}

      {/* Preview */}
      <div className="overflow-hidden rounded-xl ring-1 ring-white/10 bg-black/30">
        <Link href={tvUrl} target="_blank" rel="noopener noreferrer nofollow">
            <img
              src={imgUrl}
              alt={`TradingView snapshot ${idToShow}`}
              className="w-full h-auto block"
              loading="eager"
            />
          </Link>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-white/50">
        Paste a TradingView <span className="font-semibold">Share → Copy link</span> snapshot (format:{" "}
        <code className="text-white/70">https://www.tradingview.com/x/ID/</code>) and we’ll show the preview.
        Links are stored locally on your device only. PIN protects editing, not viewing.
      </p>

      <div className="mt-2 text-[10px] text-white/40">
        Tip: To change or remove the link later, click <span className="font-semibold">Edit</span>.
      </div>
    </div>
  );
}

/** Fixed CTA bar (mobile) */
function MobileCTABar() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed left-0 right-0 bottom-0 z-[9999] border-t border-white/10 bg-black/40 backdrop-blur supports-[backdrop-filter]:bg-black/40 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom,0px),0.5rem)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          href="https://t.me/CryptoMainlyPublic"
          target="_blank"
          className="flex-1 rounded-xl bg-white/90 px-4 py-3 text-center text-sm font-semibold text-black hover:bg-white"
        >
          Join Public Group
        </Link>
        <Link
          href="https://t.me/CryptoMainlyVIP"
          target="_blank"
          className="rounded-xl bg-amber-400/90 px-4 py-3 text-sm font-semibold text-black ring-1 ring-amber-300/50 hover:bg-amber-400"
        >
          VIP
        </Link>
      </div>
    </div>,
    document.body
  );
}

export default function Page() {
  return (
    <>
      <Head>
        <title>CryptoMainly Portal — OLED Fixed CTA V1</title>
        <meta name="description" content="CryptoMainly Portal — tools, links, and updates for the CryptoMainly community." />
      </Head>

      {/* Page wrapper */}
      <div
        className="relative min-h-screen w-full bg-[#040A14] text-white"
        style={{
          background:
            "radial-gradient(1200px 600px at 10% -10%, rgba(17, 48, 86, 0.25), transparent 60%), radial-gradient(900px 500px at 80% -10%, rgba(84, 48, 122, 0.20), transparent 60%), linear-gradient(180deg, #0a1824 0%, #05131e 60%, #020a14 100%)",
        }}
      >
        {/* OLED softener for mobile */}
        <div
          className="pointer-events-none absolute inset-0 z-0 md:hidden"
          style={{ background: "rgba(255,255,255,0.05)", mixBlendMode: "screen" }}
        />

        {/* Header */}
        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
            <div className="flex items-center gap-3">
              <img
                src="/assets/CLogo.png"
                alt="CryptoMainly Logo"
                className="h-8 w-8"
              />
              <span className="text-lg font-semibold">CryptoMainly Portal</span>
            </div>

            <nav className="flex items-center gap-3">
              <Link
                href="https://t.me/CryptoMainlyPublic"
                target="_blank"
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              >
                Telegram
              </Link>
              <Link
                href="https://youtube.com/@CryptoMainly"
                target="_blank"
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              >
                YouTube
              </Link>
              <Link
                href="https://x.com/CryptoMainly"
                target="_blank"
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              >
                X
              </Link>
            </nav>
          </div>
        </header>

        {/* Content grid */}
        <main className="relative z-10">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-24 pt-2 md:grid-cols-[340px_1fr_320px] md:px-6">
            {/* Left column */}
            <div className="flex flex-col gap-4">
              {/* Chart Preview */}
              <ChartPreviewWidget />

              {/* Market Metrics */}
              <MarketMetricsWidget />
            </div>

            {/* Center column */}
            <div className="flex flex-col gap-4">
              {/* Hero / Banner */}
              <div
                className="relative overflow-hidden rounded-2xl ring-1 ring-white/10"
                style={{
                  background:
                    "radial-gradient(1000px 300px at -20% -50%, rgba(255,255,255,0.15), transparent), radial-gradient(1200px 350px at 120% -50%, rgba(255,255,255,0.12), transparent)",
                }}
              >
                <img
                  src="/assets/hero-bg.jpg"
                  alt="Hero"
                  className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
                />

                <div className="relative p-6 md:p-8">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 overflow-hidden rounded-full ring-1 ring-white/20 bg-black/30 grid place-content-center">
                      <img
                        src="/assets/coin-gold.png"
                        alt="CryptoMainly badge"
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/80">CryptoMainly</div>
                      <h1 className="text-2xl font-semibold leading-tight">G-Bot • Indicator Lab • VIP Community</h1>
                    </div>
                  </div>

                  <div className="mt-4 max-w-[70ch] text-sm text-white/80">
                    <p>
                      Welcome to the CryptoMainly Portal — your hub for our latest indicators, G-Bot automation, VIP
                      updates, and curated crypto links. Tap a quick link below or explore the widgets on the sides.
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      href="https://t.me/CryptoMainlyVIP"
                      target="_blank"
                      className="rounded-xl bg-amber-400/90 px-4 py-2 text-sm font-semibold text-black ring-1 ring-amber-300/50 hover:bg-amber-400"
                    >
                      Join VIP
                    </Link>
                    <Link
                      href="https://t.me/CryptoMainlyPublic"
                      target="_blank"
                      className="rounded-xl bg-white/10 px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/15"
                    >
                      Public Group
                    </Link>
                    <Link
                      href="https://www.tradingview.com/u/CryptoMainly/"
                      target="_blank"
                      className="rounded-xl bg-white/10 px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/15"
                    >
                      TradingView
                    </Link>
                  </div>

                  <div className="mt-5 text-[11px] text-white/60">
                    <p>
                      Trading involves substantial risk. Past performance is not indicative of future results. Do not risk
                      funds you cannot afford to lose. This is not financial advice. Use at your own risk. Please read full Disclaimer:
                      https://docs.google.com/document/d/1fY-C5aUJVcSbprbijgi3AkXVPNvc9UMNgzVktt-vDxE
                    </p>
                  </div>
                </div>
              </div>

              {/* Follow Banner */}
              <div
                className="mt-6 overflow-hidden rounded-2xl ring-1 ring-white/10 filter brightness-140 contrast-110"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(2,10,20,0.45), rgba(2,10,20,0.18)), url('/assets/follow-banner2.jpg')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-12 md:px-8">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/20 bg-black/30 grid place-content-center">
                      <img
                        src="/assets/coin-gold.png"
                        alt="CryptoMainly badge"
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/90">YouTube • X (Twitter)</div>
                      <div className="text-lg font-semibold">Follow CryptoMainly</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href="https://youtube.com/@CryptoMainly"
                      target="_blank"
                      className="rounded-full bg-white/80 px-3.5 py-1 text-xs font-semibold text-black hover:bg-white"
                    >
                      Subscribe
                    </Link>
                    <Link
                      href="https://x.com/CryptoMainly"
                      target="_blank"
                      className="rounded-full bg-black/80 px-3.5 py-1 text-xs font-semibold text-white hover:bg-black"
                    >
                      Follow
                    </Link>
                  </div>
                </div>

                {/* Social mini-cards */}
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* YouTube */}
                  <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-content-center rounded-lg bg-transparent ring-1 ring-white/10">
                          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="2" y="5" width="20" height="14" rx="3" ry="3" fill="#FF0000"></rect>
                            <polygon points="10,9 16,12 10,15" fill="#FFFFFF"></polygon>
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-white/60">Tutorials • livestreams • deep dives</div>
                          <div className="font-semibold">YouTube</div>
                        </div>
                      </div>
                      <Link
                        href="https://youtube.com/@CryptoMainly"
                        target="_blank"
                        className="rounded-full bg-white/80 px-3.5 py-1 text-xs font-semibold text-black hover:bg-white"
                      >
                        Subscribe
                      </Link>
                    </div>
                  </div>

                  {/* X */}
                  <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-content-center rounded-lg bg-black">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 4 L20 20" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                            <path d="M20 4 L4 20" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-white/60">Daily updates • alpha threads • news</div>
                          <div className="font-semibold">X (Twitter)</div>
                        </div>
                      </div>
                      <Link
                        href="https://x.com/CryptoMainly"
                        target="_blank"
                        className="rounded-full bg-white/80 px-3.5 py-1 text-xs font-semibold text-black hover:bg-white"
                      >
                        Follow
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  { icon: "⚙️", title:"Indicator Lab", tag:"Tools", desc:"Custom TradingView indicators", url:"https://www.tradingview.com/u/CryptoMainly/"},
                  { icon: "🤖", title:"G-Bot Automation", tag:"Signals", desc:"JSON alerts via 3Commas", url:"https://t.me/CryptoMainlyVIP"},
                  { icon: "📺", title:"YouTube Channel", tag:"Videos", desc:"Guides & livestreams", url:"https://youtube.com/@CryptoMainly"},
                  { icon: "𝕏", title:"X / Twitter", tag:"Social", desc:"Daily updates", url:"https://x.com/CryptoMainly"},
                  { icon: "📊", title:"Copyable Charts", tag:"TV", desc:"Member-ready shared charts", url:"https://t.me/CryptoMainlyVIP"},
                  { icon: "🧪", title:"Indicator Testers", tag:"Community", desc:"Help test our tools", url:"https://t.me/CryptoMainlyVIP"},
                  { icon: "🧭", title:"VIP Roadmap", tag:"Docs", desc:"What’s coming next", url:"https://t.me/CryptoMainlyVIP"},
                  { icon: "📜", title:"Disclaimer", tag:"Docs", desc:"Read before trading", url:"https://docs.google.com/document/d/1fY-C5aUJVcSbprbijgi3AkXVPNvc9UMNgzVktt-vDxE"},
                  { icon: "🏦", title:"Bitget Crypto Exchange", tag:"Referral", desc:"Our preferred exchange", url:"https://www.bitget.com/referral/register?clacCode=WLRHARHW"},
                  { icon: "🤖", title:"3Commas", tag:"Referral", desc:"Automation & bots", url:"https://app.3commas.io/auth/registration?c=tc2002246"},
                  { icon: "🤝", title:"Contact Us", tag:"", desc:"Sponsorships & partnerships", url:"https://t.me/CryptoMainlyLee"},
                  { icon: "📧", title:"Email Sign-Up", tag:"Form", desc:"Get updates by email", url:"#email"},
                ].map((link,i)=>(
                  <Link
                    key={i}
                    href={link.url}
                    target="_blank"
                    className="group flex items-start gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/10"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-content-center rounded-xl bg-white/10 ring-1 ring-white/10">
                      <span className="text-base">{link.icon}</span>
                    </div>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{link.title}</div>
                        <div className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70 ring-1 ring-white/10">{link.tag}</div>
                      </div>
                      <div className="mt-0.5 text-xs text-white/60">{link.desc}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* Email capture */}
              <div id="email" className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <EmailCapture />
              </div>

              {/* Price Widget */}
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <PriceWidget />
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-xs text-white/60 md:flex-row md:items-center md:justify-between md:px-6">
            <div>© {new Date().getFullYear()} CryptoMainly. All rights reserved.</div>
            <div className="flex items-center gap-3">
              <Link href="https://t.me/CryptoMainlyVIP" target="_blank" className="hover:text-white">VIP</Link>
              <span className="opacity-30">•</span>
              <Link href="https://t.me/CryptoMainlyPublic" target="_blank" className="hover:text-white">Public</Link>
              <span className="opacity-30">•</span>
              <Link href="https://youtube.com/@CryptoMainly" target="_blank" className="hover:text-white">YouTube</Link>
              <span className="opacity-30">•</span>
              <Link href="https://x.com/CryptoMainly" target="_blank" className="hover:text-white">X</Link>
            </div>
          </div>
        </footer>

        {/* Mobile CTA Portal */}
        <MobileCTABar />
      </div>
    </>
  );
}
