"use client";

import { useState } from "react";

export default function EmailCapture() {
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !agree || loading) return;

    setLoading(true);
    try {
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, telegram }),
      }).catch(() => {});
      // Always show success to the user (per our behavior)
      setOk(true);
      setEmail("");
      setTelegram("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label="Stay updated"
      className="
        w-full max-w-[360px]            /* compact to match right rail */
        rounded-2xl border border-white/10
        bg-[#0b1320]/70 backdrop-blur
        shadow-lg shadow-black/30
        p-4 text-white
      "
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Stay updated — free insights</h3>
        <span className="text-[11px] text-white/55">Unsubscribe anytime.</span>
      </div>

      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        {/* Email */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
            {/* mail icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.5" opacity=".6" />
              <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.5" opacity=".6" />
            </svg>
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Enter email here"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="
              w-full h-10 pl-9 pr-3 text-[13px]
              rounded-full border border-white/12
              bg-black/30 placeholder-white/45
              outline-none focus:border-yellow-400/60
            "
          />
        </div>

        {/* Telegram */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
            {/* paper-plane icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 3L3 10l7 3 3 7 8-17z" stroke="currentColor" strokeWidth="1.5" opacity=".65" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Telegram name"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            className="
              w-full h-10 pl-9 pr-3 text-[13px]
              rounded-full border border-white/12
              bg-black/30 placeholder-white/45
              outline-none focus:border-yellow-400/60
            "
          />
        </div>

        {/* Consent */}
        <label className="flex items-center gap-2 text-[12px] text-white/75">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/30"
          />
          I agree to receive updates, see the{" "}
          <a href="/privacy" className="underline hover:text-yellow-300">privacy notice</a>.
        </label>

        {/* Button + inline success text */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !agree || !email}
            className="
              inline-flex items-center justify-center
              h-10 px-4 text-[13px] font-semibold
              rounded-full text-black
              bg-yellow-400/90 hover:bg-yellow-300
              disabled:opacity-50 disabled:cursor-not-allowed
              shadow
            "
          >
            {loading ? "Sending…" : "Get updates"}
          </button>

          {ok && (
            <span className="text-[13px] text-emerald-300">
              Success — welcome aboard!
            </span>
          )}
        </div>

        {/* Tip */}
        <p className="text-[11px] leading-4 text-white/60">
          Top Tip: Include your Telegram username to be added to
          CryptoMainly exclusive Telegram Groups. Receive VIP offer pings
          and market alerts first.
        </p>
      </form>
    </section>
  );
}
