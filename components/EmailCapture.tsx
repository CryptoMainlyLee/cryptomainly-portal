"use client";

import { useState } from "react";

export default function EmailCapture() {
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<null | "ok" | "err">(null);
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !agree || loading) return;

    setLoading(true);
    setDone(null);
    setMsg("");

    try {
      // minimal payload; backend derives IP and adds source
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, telegram }),
      });

      // UI stays positive even if Sheets/API is slow — we log problems
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.warn("Subscribe non-200:", res.status, t);
      }

      setDone("ok");
      setMsg("Subscribed! You’ll get updates soon.");
      setEmail("");
      setTelegram("");
    } catch (err) {
      console.warn("Subscribe error:", err);
      // still show success to the user (requested behavior)
      setDone("ok");
      setMsg("Subscribed! You’ll get updates soon.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label="Stay updated"
      className="
        w-full max-w-[340px]             /* match price widget width */
        rounded-xl border border-white/10
        bg-[#0b1320]/70 backdrop-blur
        shadow-lg shadow-black/30
        p-3 md:p-4                        /* tighter padding */
        text-white
      "
    >
      <h3 className="text-sm font-semibold text-white/90">
        Stay updated — free insights
      </h3>

      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        <div className="grid gap-2">
          <label className="sr-only" htmlFor="cm-email">Email</label>
          <input
            id="cm-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.co.uk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="
              h-9 px-3 text-sm rounded-lg
              bg-black/30 border border-white/12
              placeholder-white/40
              outline-none focus:border-yellow-400/60
            "
          />

          <label className="sr-only" htmlFor="cm-telegram">Telegram</label>
          <input
            id="cm-telegram"
            type="text"
            placeholder="Telegram user (optional)"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            className="
              h-9 px-3 text-sm rounded-lg
              bg-black/30 border border-white/12
              placeholder-white/40
              outline-none focus:border-yellow-400/60
            "
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-white/70 select-none">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-white/20 bg-black/30"
          />
          I agree to receive updates, see the{" "}
          <a href="/privacy" className="underline text-white/90 hover:text-yellow-300">
            privacy notice
          </a>.
        </label>

        <button
          type="submit"
          disabled={loading || !agree || !email}
          className="
            h-9 px-3 text-sm font-semibold
            rounded-lg text-black
            bg-yellow-400/90 hover:bg-yellow-300
            disabled:opacity-50 disabled:cursor-not-allowed
            shadow
          "
        >
          {loading ? "Sending…" : "Get updates"}
        </button>

        {/* tiny helper text */}
        <p className="text-[11px] leading-4 text-white/55 pt-1">
          Tip: Include your Telegram username to be added to CryptoMainly exclusive Telegram Groups.
          Receive VIP offer pings and market alerts first.
        </p>

        {done && (
          <div
            aria-live="polite"
            className={`text-[12px] mt-1 ${
              done === "ok" ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {msg}
          </div>
        )}
      </form>
    </section>
  );
}
