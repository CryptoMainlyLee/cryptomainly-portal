"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PriceWidget from "@/components/PriceWidget";
import MarketMetricsWidget from "@/components/MarketMetricsWidget";
import EmailCapture from "@/components/EmailCapture";

/* Stronger outer halo pulse (used for FREE button) */
const GlowStyles = () => (
  <style jsx global>{`
    @keyframes outerGlowPulse {
      0%, 100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.55;
      }
      50% {
        transform: translate(-50%, -50%) scale(1.18);
        opacity: 1;
      }
    }
  `}</style>
);

/** Fixed CTA bar (mobile) */
function MobileCTABar() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed left-0 right-0 bottom-0 z-[9999] border-t border-white/10 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/40 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom,0px),0.5rem)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          href="https://t.me/CryptoMainlyPublic"
          target="_blank"
          className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-center text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15 active:scale-[0.99]"
        >
          Start Free
        </Link>
        <Link
          href="https://t.me/CryptoMainlyLee"
          target="_blank"
          className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black transition hover:bg-amber-400 active:scale-[0.99]"
        >
          Join VIP 👑
        </Link>
      </div>
    </div>,
    document.body
  );
}

export default function Page() {
  return (
    <>
      <GlowStyles />

      <div
        className="relative min-h-screen text-white pb-28" /* extra bottom pad so the mobile CTA never overlaps */
        style={{
          background:
            "linear-gradient(180deg, #0a1824 0%, #05131e 60%, #020a14 100%)",
        }}
      >
        {/* OLED softener for mobile */}
        <div
          className="pointer-events-none absolute inset-0 z-0 md:hidden"
          style={{ background: "rgba(255,255,255,0.05)", mixBlendMode: "screen" }}
        />

        {/* Desktop floating widgets */}
        <div className="fixed right-6 bottom-6 z-30 hidden md:block w-[340px] space-y-3">
          <PriceWidget />
          {/* Email capture sits under prices on desktop (same column/width) */}
          <EmailCapture />
        </div>
        <div className="fixed left-6 bottom-6 z-30 hidden md:block">
          <MarketMetricsWidget />
        </div>

        {/* Main container */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-32">
          {/* Market bar */}
          <div className="mt-6 mb-3 rounded-xl bg-white/5 px-4 py-2 text-[12px] leading-6 text-white/80 ring-1 ring-white/10">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>Coins: <span className="text-white/90">19,324</span></span>
              <span>Exchanges: <span className="text-white/90">1,408</span></span>
              <span>Market Cap: <span className="text-white/90">$3.82 T</span> <span className="text-green-400">▲ 0.01 %</span></span>
              <span>24 h Vol: <span className="text-white/90">$116.4 B</span></span>
              <span>Dominance: <span className="text-white/90">BTC 57.9 % • ETH 12.4 %</span></span>
            </div>
          </div>

          {/* Mobile snapshot: Price -> Metrics -> Email */}
          <div className="md:hidden mt-2 flex flex-col gap-4 items-center">
            <div className="w-full max-w-[340px]">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="text-sm font-semibold text-white/80">
                  <span className="text-amber-400">▣</span> Market Snapshot
                </div>
                <div className="text-[11px] text-white/50">Updated live</div>
              </div>
              <PriceWidget />
            </div>

            <div className="w-full max-w-[340px]">
              <MarketMetricsWidget />
            </div>

            {/* Email capture moved BELOW metrics on mobile */}
            <div className="w-full max-w-[340px]">
              <EmailCapture />
            </div>
          </div>

          {/* Hero + G-Bot */}
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Hero */}
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Pro Crypto Trading Signals, Education, Tools, News & Community
              </div>

              <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
                <span className="block">CryptoMainly</span>
                <span className="mt-2 block text-amber-400">Pro Crypto Trading</span>
              </h1>

              <p className="mt-4 max-w-2xl text-white/80">
                Your hub for access to VIP Telegram, Signals, G-Bot automation,
                Indicator Lab custom indicators, TradingView charts, and socials.
                Telegram DM <span className="font-semibold text-white">@CryptoMainlyLee</span> with any questions.
              </p>

              <p className="mt-3 text-sm font-semibold text-amber-300 animate-pulse">
                👑 Start Free or Unlock VIP Access
              </p>

              <div className="mt-4 flex flex-wrap gap-3 animate-pop-in">
                <Link
                  href="https://t.me/CryptoMainlyLee"
                  target="_blank"
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60 transition active:scale-[0.99]"
                >
                  Join VIP
                </Link>

                {/* FREE button with STRONGER dual-layer pulsing halo */}
                <span className="relative inline-flex">
                  {/* Outer soft halo (bigger, softer) */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-24 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      background:
                        "radial-gradient(closest-side, rgba(251,191,36,0.38), rgba(251,191,36,0.16) 58%, rgba(251,191,36,0) 78%)",
                      filter: "blur(22px)",
                      animation: "outerGlowPulse 1.8s ease-in-out infinite",
                      animationDelay: "0.12s",
                    }}
                  />
                  {/* Core halo (tighter, brighter) */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-20 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      background:
                        "radial-gradient(closest-side, rgba(251,191,36,0.95), rgba(251,191,36,0.42) 56%, rgba(251,191,36,0) 76%)",
                      filter: "blur(14px)",
                      animation: "outerGlowPulse 1.8s ease-in-out infinite",
                    }}
                  />

                  {/* Actual button (plain & crisp) */}
                  <Link
                    href="https://t.me/CryptoMainlyPublic"
                    target="_blank"
                    className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-400/60 active:scale-[0.99]"
                  >
                    Start Here FREE
                  </Link>
                </span>
              </div>
            </div>

            {/* G-Bot card */}
            <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <div className="mb-3 inline-flex items-center gap-2 text-xs text-white/60">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Featured
              </div>
              <h3 className="text-xl font-bold">G-Bot + Indicator Lab</h3>
              <p className="mt-2 text-white/80">
                Automated entries with G-Bot and enhanced manual trading edge with
                custom indicators. Built for clarity, control, and discipline.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="https://www.tradingview.com/script/QAx08ctT-G-Bot-v3/"
                  className="group inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition hover:bg-white/15 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Explore G-Bot
                </Link>
                <Link
                  href="https://www.tradingview.com/u/CryptoMainly/#published-scripts"
                  className="group inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition hover:bg-white/15 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Indicator Lab
                </Link>
              </div>
              <p className="mt-6 text-[11px] leading-4 text-white/50">
                Crypto trading involves significant risk. Please do your own
                research and only invest what you can afford to lose. Potentially
                100 % of investment is at risk. Please read full Disclaimer:
                https://docs.google.com/document/d/1fY-C5aUJVcSbprbijgi3AkXVPNvc9UMNgzVktt-vDxE
              </p>
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
                  className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-semibold text-black hover:bg-white"
                >
                  Subscribe
                </Link>
                <Link
                  href="https://x.com/CryptoMainly"
                  target="_blank"
                  className="rounded-full bg-black/10 px-4 py-1.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
                >
                  Follow
                </Link>
              </div>
            </div>
          </div>

          {/* Social mini-cards */}
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* YouTube */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-content-center rounded-lg bg-red-600/90">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M10 15l5.19-3L10 9v6zm11-3c0-1.64-.13-3.27-.38-4.89-.21-1.36-1.33-2.43-2.7-2.63C15.95 3.13 12 3 12 3s-3.95.13-5.92.48c-1.37.2-2.49 1.27-2.7 2.63C3.13 8.73 3 10.36 3 12s.13 3.27.38 4.89c.21 1.36 1.33 2.43 2.7 2.63 1.97.35 5.92.48 5.92.48s3.95-.13 5.92-.48c1.37-.2 2.49-1.27 2.7-2.63.25-1.62.38-3.25.38-4.89z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs text-white/60">Walkthroughs • deep dives • recaps</div>
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
                  <div className="grid h-9 w-9 place-content-center rounded-lg bg-blue-500/90">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M18 2h-3l-3 4-3-4H6l4.5 6L6 22h3l-3-5 3 5h3l-4.5-7L18 2z" />
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
                  className="rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
                >
                  Follow
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Links (12) */}
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
              <span className="text-amber-400">▣</span> Quick Links
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              {[
                { icon: "👑", title:"VIP Telegram & Membership", tag:"Join VIP", desc:"Premium signals, charts, strategies & automation", url:"https://t.me/CryptoMainlyLee"},
                { icon: "📈", title:"Telegram Charts", tag:"FREE", desc:"Charts, On-Chain, Fundamentals, layouts & templates", url:"https://t.me/CryptomainlyCharts"},
                { icon: "💬", title:"Public Telegram", tag:"FREE", desc:"Join the community chat", url:"https://t.me/CryptoMainlyPublic"},
                { icon: "🤖", title:"G-Bot Trading", tag:"Automated Bot", desc:"For further info & details", url:"https://www.tradingview.com/script/QAx08ctT-G-Bot-v3/"},
                { icon: "🧪", title:"Indicator Lab", tag:"Custom Indicators", desc:"Custom TradingView indicators", url:"https://www.tradingview.com/u/CryptoMainly/#published-scripts"},
                { icon: "✖️", title:"X (Twitter)", tag:"", desc:"Daily updates & alpha threads", url:"https://x.com/CryptoMainly"},
                { icon: "▶️", title:"YouTube", tag:"", desc:"Deep dives, recaps, education, Shorts", url:"https://youtube.com/@CryptoMainly"},
                { icon: "🎵", title:"TikTok", tag:"", desc:"Quick trading tips & updates", url:"https://www.tiktok.com/@cryptomainly?lang=en-GB"},
                { icon: "📊", title:"Trading View", tag:"", desc:"Powerful all-in-one chart platform", url:"https://www.tradingview.com/pricing/?share_your_love=CryptoMainly"},
                { icon: "🏦", title:"Bitget Crypto Exchange", tag:"Join", desc:"Crypto Exchange with copy trading (UK use VPN)", url:"https://www.bitget.com/referral/register?clacCode=WLRHARHW"},
                { icon: "🤖", title:"3Commas", tag:"Join", desc:"Automated trading bots and tools", url:"https://app.3commas.io/auth/registration?c=tc2002246"},
                { icon: "🤝", title:"Contact Us", tag:"", desc:"Sponsorships & partnerships", url:"https://t.me/CryptoMainlyLee"},
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
                      <span className="font-semibold text-white">{link.title}</span>
                      {link.tag && (
                        <span className="ml-2 rounded-md bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          {link.tag}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-white/60">{link.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <MobileCTABar />
    </>
  );
}
