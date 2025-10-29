// app/components/EmailCapture.tsx
"use client";

import React from "react";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" };

const EMAIL_RE =
  /^(?:[A-Z0-9._%+-]+)@(?:[A-Z0-9-]+\.)+[A-Z]{2,}$/i;

export default function EmailCapture() {
  const [email, setEmail] = React.useState("");
  const [telegram, setTelegram] = React.useState("");
  const [agree, setAgree] = React.useState(true);
  const [state, setState] = React.useState<State>({ kind: "idle" });

  const isValidEmail = EMAIL_RE.test(email.trim());
  const canSubmit =
    state.kind !== "submitting" &&
    isValidEmail &&
    agree;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setState({ kind: "submitting" });

    // Build payload (server extracts real IP from headers; we still send a friendly source tag)
    const payload = {
      email: email.trim(),
      telegram: telegram.trim(),
      source: "CryptoMainly Portal",
    };

    try {
      // Fire-and-forget: even on network hiccups we show success for smooth UX
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Soft-fail: keep the UI positive
      console.warn("[EmailCapture] submit soft-fail", err);
    } finally {
      setState({ kind: "done" });
      setEmail("");
      setTelegram("");
    }
  }

  return (
    <section
      aria-label="Stay updated — free insights"
      className="w-full"
    >
      <div className="rounded-2xl border border-white/10 bg-[#0c1219]/70 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        {/* Header */}
        <div className="px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold tracking-wide text-white/90">
              Stay updated — <span className="text-white">free insights</span>
            </h3>
            <p className="text-xs text-white/55">
              Unsubscribe anytime.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Email */}
            <div className="relative">
              <label className="sr-only" htmlFor="ec-email">
                Email
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <span className="text-white/40">✉️</span>
              </div>
              <input
                id="ec-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-[15px] text-white placeholder:text-white/35 outline-none ring-0 transition focus:border-white/25"
              />
              {!email ? null : isValidEmail ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">✓</span>
              ) : (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400">•</span>
              )}
            </div>

            {/* Telegram (optional) */}
            <div className="relative">
              <label className="sr-only" htmlFor="ec-telegram">
                Telegram (optional)
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <span className="text-white/40">📨</span>
              </div>
              <input
                id="ec-telegram"
                type="text"
                autoComplete="off"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="Telegram username (optional)"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-[15px] text-white placeholder:text-white/35 outline-none ring-0 transition focus:border-white/25"
              />
            </div>
          </div>

          {/* Consent */}
          <div className="mt-3 flex items-start gap-2">
            <input
              id="ec-consent"
              type="checkbox"
              className="mt-[2px] h-4 w-4 rounded border-white/20 bg-white/5 text-amber-400 focus:ring-0"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <label
              htmlFor="ec-consent"
              className="text-[13px] leading-5 text-white/70"
            >
              I agree to receive updates, see the{" "}
              <a
                href="/privacy"
                className="text-white/90 underline decoration-white/30 underline-offset-[3px] hover:text-white"
              >
                privacy notice
              </a>.
            </label>
          </div>

          {/* CTA row */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="relative inline-flex h-11 items-center justify-center rounded-xl px-4 text-[15px] font-semibold text-black transition disabled:opacity-40
                         bg-amber-300 hover:bg-amber-200 active:bg-amber-400"
            >
              {/* soft glow */}
              <span className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-amber-300/30 blur-xl" />
              {state.kind === "submitting" ? "Submitting…" : "Get updates"}
            </button>

            {/* Status text */}
            {state.kind === "done" && (
              <p className="text-[13px] text-emerald-400">
                Success — welcome aboard!
              </p>
            )}
          </div>

          {/* Tip */}
          <p className="mt-3 text-[12px] leading-5 text-white/45">
            Tip: Include your Telegram username to be added to CryptoMainly
            exclusive Telegram Groups. Receive VIP offer pings and market alerts first.
          </p>
        </form>
      </div>
    </section>
  );
}
