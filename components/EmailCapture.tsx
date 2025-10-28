"use client";

import React, { useState } from "react";

type State = { status: "idle"|"sending"|"ok"|"err"; msg?: string };

export default function EmailCapture() {
  const [email, setEmail] = useState("");
  const [tg, setTg] = useState("");         // optional @telegram
  const [agree, setAgree] = useState(false);
  const [honey, setHoney] = useState("");   // honeypot
  const [state, setState] = useState<State>({ status: "idle" });

  const validate = () => {
    if (!agree) return "Please agree to the privacy notice.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address.";
    if (tg.trim() && !/^@?[a-zA-Z0-9_]{5,}$/.test(tg.trim())) return "Telegram handle looks invalid.";
    if (honey) return "Spam detected.";
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setState({ status: "err", msg: problem }); return; }

    setState({ status: "sending" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          telegram: tg.trim().replace(/^@/,""), // store without leading @
          source: "landing",
        }),
      });
      const j = await res.json();
      if (res.ok && j?.ok) {
        setState({ status: "ok", msg: "You're on the list! Check your inbox shortly." });
        setEmail(""); setTg(""); setAgree(false);
      } else {
        throw new Error(j?.error || "Subscription failed.");
      }
    } catch (err: any) {
      setState({ status: "err", msg: err?.message || "Something went wrong. Please try again." });
    }
  };

  return (
    <section className="w-full max-w-[560px] mx-auto rounded-2xl bg-[#0b121a]/90 p-4 ring-1 ring-white/10 backdrop-blur">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-white/90">Stay updated — free insights</h3>
        <span className="text-[10px] text-white/60">Unsubscribe anytime.</span>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        {/* Honeypot (hidden from users) */}
        <div className="hidden">
          <label>
            Leave this field empty
            <input value={honey} onChange={(e)=>setHoney(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-white/20">
            <span className="text-[16px]">📧</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              placeholder="Enter email here"
              className="w-full bg-transparent text-[13px] text-white placeholder:text-white/40 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-white/20">
            <span className="text-[16px]">📨</span>
            <input
              type="text"
              value={tg}
              onChange={(e)=>setTg(e.target.value)}
              placeholder="Telegram name"
              className="w-full bg-transparent text-[13px] text-white placeholder:text-white/40 outline-none"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-[12px] text-white/70">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e)=>setAgree(e.target.checked)}
            className="mt-[2px] h-4 w-4 rounded border-white/30 bg-white/10"
          />
          <span>
            I agree to receive updates, see the{" "}
            <a href="/privacy" className="text-[#f4d06f] hover:underline">privacy notice</a>.
          </span>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={state.status === "sending"}
            className="relative rounded-xl bg-white/10 px-4 py-2 text-[13px] font-semibold ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-60"
          >
            {state.status === "sending" ? "Adding…" : "Get updates"}
          </button>
          {state.status === "ok" && (
            <span className="text-[12px] text-emerald-400">Success — welcome aboard!</span>
          )}
          {state.status === "err" && (
            <span className="text-[12px] text-red-400">{state.msg}</span>
          )}
        </div>

        <p className="text-[11px] text-white/50">
          Top Tip:  Include your Telegram username to be added to Cryptomainly exlusive Telegram Groups.  Receive VIP offer pings and market alerts first.
        </p>
      </form>
    </section>
  );
}
