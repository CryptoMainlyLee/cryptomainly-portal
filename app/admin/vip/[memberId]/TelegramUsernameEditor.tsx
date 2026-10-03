"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateTelegramUsernameAction } from "../actions";
import { validateTelegramUsernameDraft } from "../_lib/member-editing";
import type { MemberTelegramAccount } from "../_lib/data";

type Props = {
  memberId: string;
  account: MemberTelegramAccount | null;
};

function show(value: string | number | null | boolean) {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
export default function TelegramUsernameEditor({ memberId, account }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [username, setUsername] = useState(account?.telegram_username ?? "");
  const [reason, setReason] = useState("");
  const [normalized, setNormalized] = useState<string | null>(account?.telegram_username ?? null);
  const [error, setError] = useState<string | null>(null);
  const [conflictMemberId, setConflictMemberId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const review = () => {
    try {
      const next = validateTelegramUsernameDraft({ telegramUsername: username }).telegramUsername;
      const current = validateTelegramUsernameDraft({ telegramUsername: account?.telegram_username ?? null }).telegramUsername;
      if (next === current) throw new Error("No username change to review.");
      setNormalized(next);
      setReviewing(true);
      setError(null);
      setConflictMemberId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the username and try again.");
    }
  };
  const save = async () => {
    setSaving(true);
    const result = await updateTelegramUsernameAction({
      memberId,
      telegramAccountId: account?.telegram_account_id ?? null,
      expectedUsername: account?.telegram_username ?? null,
      proposedUsername: normalized,
      reason,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      setConflictMemberId("existingMemberId" in result ? result.existingMemberId ?? null : null);
      return;
    }
    setEditing(false);
    setReviewing(false);
    setError(null);
    setConflictMemberId(null);
    setReason("");
    router.refresh();
  };

  return (
    <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div><h3 className="font-semibold text-white">Telegram username</h3>
        <p className="mt-1 text-xs text-slate-500">Username is editable; verified Telegram identity is read only.</p></div>
        {!editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-300">Edit</button> : null}
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-600">telegram_account_id · read only</dt><dd className="mt-1 break-all text-slate-400">{show(account?.telegram_account_id ?? null)}</dd></div>
        <div><dt className="text-slate-600">telegram_user_id · read only</dt><dd className="mt-1 text-slate-300">{show(account?.telegram_user_id ?? null)}</dd></div>
        <div><dt className="text-slate-600">Bot linked</dt><dd className="mt-1 text-slate-300">{account?.telegram_user_id ? "Yes" : "No — username only"}</dd></div>
        <div><dt className="text-slate-600">dm_available · read only</dt><dd className="mt-1 text-slate-300">{show(account?.dm_available ?? false)}</dd></div>
        <div><dt className="text-slate-600">linked_at · read only</dt><dd className="mt-1 text-slate-400">{show(account?.linked_at ?? null)}</dd></div>
        <div><dt className="text-slate-600">bot_started_at · read only</dt><dd className="mt-1 text-slate-400">{show(account?.bot_started_at ?? null)}</dd></div>
        <div><dt className="text-slate-600">last_verified_at · read only</dt><dd className="mt-1 text-slate-400">{show(account?.last_verified_at ?? null)}</dd></div>
        <div><dt className="text-slate-600">telegram_raw · preserved</dt><dd className="mt-1 break-all text-slate-400">{show(account?.telegram_raw ?? null)}</dd></div>
      </dl>
      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}{conflictMemberId ? <> <Link className="underline" href={`/admin/vip/${conflictMemberId}`}>Open existing member</Link></> : null}</p> : null}
      {editing && !reviewing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Telegram username
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={33} placeholder="@username" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Reason — optional
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={review} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950">Review change</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      ) : null}
      {editing && reviewing ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-slate-950/60 p-4">
          <h4 className="text-sm font-semibold text-amber-200">Preview changes</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><span className="text-xs text-slate-600">Before</span><p className="mt-1 text-sm">{show(account?.telegram_username ?? null)}</p></div>
            <div><span className="text-xs text-slate-600">After</span><p className="mt-1 text-sm text-amber-200">{show(normalized)}</p></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Numeric Telegram identity and link state will not be changed.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? "Saving…" : "Confirm & save"}</button>
            <button type="button" disabled={saving} onClick={() => setReviewing(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Back</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
