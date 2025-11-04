// app/page.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

/* ------------------------- Shared tiny helpers ------------------------- */

function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-2xl bg-[#0b1220]/70 ring-1 ring-white/5 shadow-[0_10px_30px_rgba(0,0,0,.35)] backdrop-blur",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* ------------------------- Chart Preview (left) ------------------------ */

const PREVIEW_PLACEHOLDER =
  "https://www.tradingview.com/x/nHllMfx1L/"; // default example

function ChartPreview() {
  // simple client-side PIN gate (optional)
  const [pinOK, setPinOK] = useState(true); // set to false if you want PIN on first load
  const [pin, setPin] = useState("");
  const VALID_PIN = useMemo(
    () => (process.env.NEXT_PUBLIC_CHART_PIN || "2468").trim(),
    []
  );

  const [url, setUrl] = useState(PREVIEW_PLACEHOLDER);
  const [temp, setTemp] = useState(PREVIEW_PLACEHOLDER);

  const isValid = (u: string) =>
    /^https:\/\/(www\.)?tradingview\.com\/x\/[a-zA-Z0-9]+\/?$/.test(u.trim());

  function apply() {
    if (!isValid(temp)) return;
    setUrl(temp.trim());
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/90">Chart Preview</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={apply}
            className="text-[11px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 transition"
            title="Open"
          >
            Open
          </button>
          <details className="group relative">
            <summary className="list-none cursor-pointer text-[11px] px-2 py-1 rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition">
              Edit
            </summary>
            <div className="absolute z-20 mt-2 right-0 w-[320px] p-3 rounded-xl bg-[#0c1426] ring-1 ring-white/10 shadow-xl">
              {!pinOK ? (
                <div className="space-y-2">
                  <label className="text-xs text-white/70">Enter PIN</label>
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    className="w-full rounded-md bg-black/30 px-3 py-2 text-sm text-white/90 outline-none ring-1 ring-white/10 focus:ring-emerald-400/40"
                  />
                  <button
                    onClick={() => setPinOK(pin.trim() === VALID_PIN)}
                    className="w-full rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-black text-sm font-medium py-2 transition"
                  >
                    Unlock
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs text-white/70">
                    TradingView Share link
                  </label>
                  <input
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    placeholder="https://www.tradingview.com/x/…/"
                    className="w-full rounded-md bg-black/30 px-3 py-2 text-sm text-white/90 outline-none ring-1 ring-white/10 focus:ring-emerald-400/40"
                  />
                  <button
                    onClick={() => {
                      if (isValid(temp)) {
                        setUrl(temp.trim());
                      } else {
                        alert(
                          "Please paste a valid TradingView Share link (https://www.tradingview.com/x/XXXX/)."
                        );
                      }
                    }}
                    className="w-full rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-black text-sm font-medium py-2 transition"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>

      <input
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        placeholder="https://www.tradingview.com/x/…/"
        className="mt-3 w-full rounded-lg bg-black/30 px-3 py-2 text-[13px] text-white/80 ring-1 ring-white/10 outline-none focus:ring-emerald-400/40"
      />

      <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-white/10">
        {/* We sandbox the external chart preview with referrer isolation */}
        <iframe
          src={url}
          className="h-[220px] w-full bg-[#0a0f1a]"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>

      <p className="mt-2 text-[11px] leading-4 text-white/50">
  VIP members are able to use TradingView’s{" "}
  <span className="font-semibold text-white">Share → Copy Chart</span>{" "}
  to copy and create their own version of the chart on TradingView.
</p>
    </Card>
  );
}

/* ------------------- Brand-faithful inline SVG icons ------------------- */

function YouTubeGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="ytg" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ff0033" offset="0" />
          <stop stopColor="#e3002a" offset="1" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="4" width="21" height="16" rx="5" fill="url(#ytg)" />
      <path d="M10 9.5v5l4.5-2.5z" fill="white" />
    </svg>
  );
}

function XGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="0" y="0" width="24" height="24" rx="6" fill="#0a0a0a" />
      <path
        fill="white"
        d="M17.53 6.47h-1.82l-3.05 3.89-2.64-3.89H6.47l4.15 6-4 5.06h1.82l3.06-3.87 2.66 3.87h3.55l-4.3-6 4.12-5.06z"
      />
    </svg>
  );
}

/* --------------------------- Hero + banner row ------------------------- */

function HeroBanner() {
  return (
    <Card className="p-6 md:p-7">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: text */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60 ring-1 ring-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Pro Crypto Trading Signals, Education, Tools, News & Community
          </span>
          <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            <span className="block">CryptoMainly</span>
            <span className="text-amber-300">Pro Crypto Trading</span>
          </h1>
          <p className="mt-3 text-white/70 max-w-[56ch]">
            Your hub for G-Bot automation, Indicator Lab, VIP Telegram, and
            copy-able TradingView charts. Reach{" "}
            <span className="font-medium text-white">@CryptoMainlyLee</span> if
            you’ve got questions.
          </p>

          <div className="mt-5 flex gap-3">
            <Link
              href="#join"
              className="rounded-xl bg-amber-300 text-black px-4 py-2.5 text-sm font-semibold shadow-[0_0_0_3px_rgba(0,0,0,.25)] hover:brightness-95 transition"
            >
              Join VIP
            </Link>
            <Link
              href="#start"
              className="rounded-xl bg-white/10 ring-1 ring-white/15 px-4 py-2.5 text-sm text-white hover:bg-white/15 transition"
            >
              Start here FREE
            </Link>
          </div>
        </div>

        {/* Right: feature panel */}
        <div className="relative">
          <Card className="p-5">
            <div className="mb-3 inline-flex items-center gap-2">
              <span className="rounded-full bg-emerald-400/20 text-emerald-300 text-[11px] px-2 py-1 ring-1 ring-emerald-400/30">
                Featured
              </span>
              <span className="text-sm font-medium text-white/80">
                G-Bot + Indicator Lab
              </span>
            </div>
            <p className="text-sm text-white/70 leading-6">
              Automated entries with G-Bot and enhanced manual edge with custom
              indicators. Built for clarity, control, and discipline.
            </p>
            <div className="mt-4 flex gap-3">
              <Link
                href="#g-bot"
                className="rounded-lg bg-white text-black text-sm font-medium px-3 py-2 hover:bg-white/90 transition"
              >
                Explore G-Bot
              </Link>
              <Link
                href="#indicators"
                className="rounded-lg bg-white/10 ring-1 ring-white/15 text-sm text-white px-3 py-2 hover:bg-white/15 transition"
              >
                Indicator Lab
              </Link>
            </div>
            <p className="mt-4 text-[11px] text-white/45 leading-4">
              Crypto trading involves significant risk. Do your own research and
              only invest what you can afford to lose. Please read our full
              Disclaimer.
            </p>
          </Card>
        </div>
      </div>

      {/* Social banner row — icons swapped to brand-faithful inline SVGs */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* YouTube */}
        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl ring-1 ring-black/10 bg-black/5 flex items-center justify-center">
              <YouTubeGlyph size={24} />
            </div>
            <div>
              <p className="text-[12px] text-white/60">Walkthroughs · deep dives · recaps</p>
              <p className="text-white font-medium">YouTube</p>
            </div>
          </div>
          <Link
            href="https://youtube.com/@CryptoMainly"
            target="_blank"
            className="rounded-lg bg-white text-black text-sm font-medium px-3 py-1.5 hover:bg-white/90 transition"
          >
            Subscribe
          </Link>
        </Card>

        {/* X (Twitter) */}
        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl ring-1 ring-white/10 bg-black flex items-center justify-center">
              <XGlyph size={24} />
            </div>
            <div>
              <p className="text-[12px] text-white/60">Daily updates · alpha threads · news</p>
              <p className="text-white font-medium">X (Twitter)</p>
            </div>
          </div>
          <Link
            href="https://x.com/CryptoMainly"
            target="_blank"
            className="rounded-lg bg-white/10 ring-1 ring-white/15 text-sm text-white px-3 py-1.5 hover:bg-white/15 transition"
          >
            Follow
          </Link>
        </Card>
      </div>
    </Card>
  );
}

/* --------------------------------- Page -------------------------------- */

export default function Page() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#081a24_0%,#05131e_60%,#020a14_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8 grid grid-cols-1 md:grid-cols-[340px,1fr] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          <ChartPreview />
          {/* Keep your other left-side widgets here */}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <HeroBanner />
          {/* Keep your other sections here */}
        </div>
      </div>
    </main>
  );
}
