"use client";

import { useState } from "react";
import { generateTelegramLinkAction } from "../actions";

type LinkState = "not_linked" | "pending" | "verified" | "unavailable";

type Props = {
  memberId: string;
  safeguardingVersion: number;
  state: LinkState;
  pendingExpiresAt: string | null;
  telegramUserId: number | null;
  telegramUsername: string | null;
  unavailableReason: string | null;
};

function formatExpiry(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function TelegramLinkingPanel({
  memberId,
  safeguardingVersion,
  state,
  pendingExpiresAt,
  telegramUserId,
  telegramUsername,
  unavailableReason,
}: Props) {
  const [currentState, setCurrentState] = useState<LinkState>(state);
  const [currentExpiry, setCurrentExpiry] = useState<string | null>(pendingExpiresAt);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    const result = await generateTelegramLinkAction({ memberId, expectedSafeguardingVersion: safeguardingVersion });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDeepLink(result.deepLink);
    setCurrentExpiry(result.expiresAt);
    setCurrentState("pending");
  };

  const copyLink = async () => {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setError(null);
    } catch {
      setCopied(false);
      setError("Copy failed. Use Open Bot instead, or generate a replacement if needed.");
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Telegram identity linking</h2>
          <p className="mt-1 text-xs text-slate-500">VIP group access: Not managed by Phase 3A</p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
          {currentState === "not_linked" ? "Not linked" : currentState === "pending" ? "Link pending" : currentState === "verified" ? "Verified" : "Unavailable"}
        </span>
      </div>

      {currentState === "verified" ? (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-xs uppercase tracking-wider text-slate-600">Telegram user ID · read only</p><p className="mt-1 text-slate-200">{telegramUserId ?? "—"}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-slate-600">Current username</p><p className="mt-1 text-slate-200">{telegramUsername ? `@${telegramUsername}` : "No username"}</p></div>
        </div>
      ) : null}

      {currentState === "unavailable" ? (
        <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
          {unavailableReason ?? "Telegram identity linking is unavailable for this member."}
        </p>
      ) : null}

      {currentState === "pending" ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-100">Link pending until {formatExpiry(currentExpiry)}.</p>
          {deepLink ? (
            <>
              <p className="mt-2 text-xs text-amber-200/80">This is a sensitive bearer link. Send it only to the intended member. It will not be recoverable after refresh.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950">{copied ? "Copied" : "Copy Link"}</button>
                <a href={deepLink} target="_blank" rel="noreferrer" className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-200">Open Bot</a>
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">The original bearer link is not stored. Generate a replacement if you need to send it again.</p>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}

      {currentState === "not_linked" ? (
        <button type="button" disabled={busy} onClick={generate} className="mt-4 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
          {busy ? "Generating…" : "Generate Telegram Link"}
        </button>
      ) : null}

      {currentState === "pending" && !deepLink ? (
        <button type="button" disabled={busy} onClick={generate} className="mt-4 rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-medium text-amber-200 disabled:opacity-50">
          {busy ? "Generating…" : "Generate replacement"}
        </button>
      ) : null}
    </section>
  );
}
