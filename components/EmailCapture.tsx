"use client";
import React, { useState } from "react";

export default function EmailCapture() {
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;           // prevent double-click spam
    setLoading(true);
    setMessage(null);

    // Always show success immediately
    setMessage("Success / Subscribed");

    // Best-effort: collect client IP (don’t block UX if it fails)
    let clientIp = "";
    try {
      const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const j = await r.json();
      clientIp = j?.ip || "";
    } catch { /* ignore */ }

    // Fire-and-forget the actual send; we don't parse the response
    fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        telegram,
        source: "CryptoMainly Portal",
        ip: clientIp,
      }),
      keepalive: true,
    }).catch(() => { /* ignore */ });

    // Clear inputs and release the button
    setEmail("");
    setTelegram("");
    setLoading(false);
  };

  return (
    <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-[#222] rounded-2xl p-5 mt-6 mx-auto max-w-md text-center shadow-lg">
      <h2 className="text-xl font-bold text-white mb-2">📩 Get Updates</h2>
      <p className="text-gray-400 mb-4 text-sm">
        Join the CryptoMainly list for new features and VIP news.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"                      // keep text so browser validation never blocks
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded-lg bg-[#111] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"
        />
        <input
          type="text"
          placeholder="Telegram username (optional)"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
          className="w-full p-3 rounded-lg bg-[#111] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"
        />

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 rounded-lg font-semibold transition 
            ${loading ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-yellow-500 hover:bg-yellow-400 text-black shadow-md"}`}
        >
          {loading ? "Submitting..." : "Get Updates"}
        </button>
      </form>

      {message && <p className="mt-3 text-sm text-green-400">{message}</p>}
    </div>
  );
}
