"use client";

import { useState } from "react";

type Status = "idle" | "success";

export default function EmailCapture() {
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Instantly show success to the user (no matter what).
    setStatus("success");

    // Fire-and-forget the actual network call.
    try {
      const payload = {
        email,
        telegram,
        source: "CryptoMainly Portal",
      };

      // keepalive means the request will still try to complete if the user navigates
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        /* swallow */
      });
    } catch {
      /* swallow */
    }

    // optional: clear the fields
    setEmail("");
    setTelegram("");
    setConsent(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-neutral-700/60 bg-neutral-900/40 p-4 md:p-5"
    >
      <h3 className="text-lg font-semibold mb-3">Stay updated — free insights</h3>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md bg-neutral-800/60 px-3 py-2 outline-none"
        />

        <input
          type="text"
          placeholder="Telegram (optional)"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
          className="w-full rounded-md bg-neutral-800/60 px-3 py-2 outline-none"
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm opacity-80">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
        />
        I agree to receive updates, see the privacy notice.
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={!consent || !email}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40"
        >
          Get updates
        </button>

        {status === "success" && (
          <span className="text-emerald-400 text-sm">Success — welcome aboard!</span>
        )}
      </div>

      <p className="mt-3 text-xs opacity-70">
        Top Tip: include your Telegram username to be added to CryptoMainly exclusive Telegram groups.  Receive VIP offer pings and market alerts first.
      </p>
    </form>
  );
}
