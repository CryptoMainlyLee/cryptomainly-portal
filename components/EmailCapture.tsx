// components/EmailCapture.tsx
"use client";

import React from "react";

export default function EmailCapture() {
  const [email, setEmail] = React.useState("");
  const [telegram, setTelegram] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<null | { ok: boolean; msg: string }>(
    null
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setDone(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, telegram }),
      });

      // We deliberately treat any server result as success for UI smoothness
      // The API already best-efforts relays to Google Sheets.
      const data = await res.json().catch(() => ({}));

      setDone({
        ok: true,
        msg:
          "Success — welcome aboard! You’ll receive updates (and VIP alerts if applicable).",
      });

      // Optional: nudge if email looked wrong (no red state, just a hint)
      if (data && data.emailValid === false) {
        setDone({
          ok: true,
          msg:
            "Success — note: your email didn’t look standard. If you don’t get updates, please try again.",
        });
      }

      // Clear inputs after success
      setEmail("");
      // keep telegram in place so people can tweak later if they want
    } catch {
      // Even on network error we still show success per your request
      setDone({
        ok: true,
        msg:
          "Success — welcome aboard! (If you don’t receive emails, please try again later.)",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <input
        type="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="enter email address"
        className="w-full sm:w-72 rounded-lg px-3 py-2 bg-[#0c1420] text-white/90 outline-none ring-1 ring-white/10 focus:ring-white/25"
      />

      <input
        type="text"
        value={telegram}
        onChange={(e) => setTelegram(e.target.value)}
        placeholder="Telegram name (optional)"
        className="w-full sm:w-60 rounded-lg px-3 py-2 bg-[#0c1420] text-white/90 outline-none ring-1 ring-white/10 focus:ring-white/25"
      />

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg px-4 py-2 bg-[#0dd47a] text-black font-semibold hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Sending..." : "Get updates"}
      </button>

      {done && (
        <div className="text-[13px] text-emerald-300/90 sm:ml-3 mt-1 sm:mt-0">
          {done.msg}
        </div>
      )}
    </form>
  );
}
