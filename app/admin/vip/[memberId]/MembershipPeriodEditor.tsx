"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { correctMembershipPeriodAction } from "../actions";
import {
  buildChangeSet,
  validateMembershipPeriodDraft,
} from "../_lib/member-editing";
import type { MemberPeriod } from "../_lib/data";

type Props = { memberId: string; period: MemberPeriod };

function show(value: unknown) {
  if (value === null || value === "") return "Unknown / blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function expectedState(period: MemberPeriod) {
  return {
    entitlement_type: period.entitlement_type,
    plan_name: period.plan_name,
    starts_on: period.starts_on,
    expires_on: period.expires_on,
    expiry_mode: period.expiry_mode,
    removal_protected: period.removal_protected,
    protection_reason: period.protection_reason,
    ended_early_on: period.ended_early_on,
    admin_note: period.admin_note,
  };
}

export default function MembershipPeriodEditor({ memberId, period }: Props) {
  const router = useRouter();
  const expected = expectedState(period);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [entitlementType, setEntitlementType] = useState(period.entitlement_type);
  const [planName, setPlanName] = useState(period.plan_name ?? "");
  const [startsOn, setStartsOn] = useState(period.starts_on ?? "");
  const [expiresOn, setExpiresOn] = useState(period.expires_on ?? "");
  const [expiryMode, setExpiryMode] = useState(period.expiry_mode);
  const [removalProtected, setRemovalProtected] = useState(period.removal_protected);
  const [protectionReason, setProtectionReason] = useState(period.protection_reason ?? "");
  const [endedEarlyOn, setEndedEarlyOn] = useState(period.ended_early_on ?? "");
  const [adminNote, setAdminNote] = useState(period.admin_note ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<null | {
    proposed: ReturnType<typeof validateMembershipPeriodDraft>;
    changes: ReturnType<typeof buildChangeSet>;
  }>(null);

  const review = () => {
    try {
      const next = validateMembershipPeriodDraft({
        entitlementType, planName, startsOn, expiresOn, expiryMode,
        removalProtected, protectionReason, endedEarlyOn, adminNote,
      });
      const after = {
        entitlement_type: next.entitlementType, plan_name: next.planName,
        starts_on: next.startsOn, expires_on: next.expiresOn,
        expiry_mode: next.expiryMode, removal_protected: next.removalProtected,
        protection_reason: next.protectionReason, ended_early_on: next.endedEarlyOn,
        admin_note: next.adminNote,
      };
      const changes = buildChangeSet(expected, after);
      if (!changes.length) throw new Error("No period correction to review.");
      if (!reason.trim()) throw new Error("A correction reason is required.");
      setPreview({ proposed: next, changes });
      setReviewing(true); setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the period and try again.");
    }
  };
  const save = async () => {
    if (!preview) return;
    setSaving(true);
    const result = await correctMembershipPeriodAction({
      memberId,
      periodId: period.membership_period_id,
      expected,
      proposed: preview.proposed,
      reason,
    });
    setSaving(false);
    if (!result.ok) { setError(result.message); return; }
    setEditing(false); setReviewing(false); setPreview(null); setReason(""); setError(null);
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-100">{show(period.starts_on)} → {period.expiry_mode === "fixed" ? show(period.expires_on) : "No expiry"}</p>
          <p className="mt-1 text-xs text-slate-500">{period.entitlement_type} · {period.plan_name ?? "VIP membership"} · {period.period_status}</p>
        </div>
        {!editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-300">Edit period</button> : null}
      </div>
      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <p className="text-[11px] uppercase tracking-wider text-slate-600">source / legacy evidence — read only</p>
        <p className="mt-1 text-xs text-slate-500">Source: {period.source} · migration_review: {period.migration_review ? "true" : "false"}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{period.legacy_notes || "No legacy source note."}</p>
      </div>
      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      {editing && !reviewing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-slate-300">Entitlement type
            <select value={entitlementType} onChange={(e) => setEntitlementType(e.target.value as typeof entitlementType)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">
              {['paid','complimentary','trial','lifetime','admin'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Plan name
            <input value={planName} onChange={(e) => setPlanName(e.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Start date
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Expiry date
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Expiry mode
            <select value={expiryMode} onChange={(e) => setExpiryMode(e.target.value as typeof expiryMode)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">
              <option value="fixed">fixed</option><option value="lifetime">lifetime</option><option value="manual_no_expiry">manual_no_expiry</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">Ended early date
            <input type="date" value={endedEarlyOn} onChange={(e) => setEndedEarlyOn(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={removalProtected} onChange={(e) => setRemovalProtected(e.target.checked)} /> Removal protected
          </label>
          <label className="text-sm text-slate-300 sm:col-span-2">Protection reason
            <input value={protectionReason} onChange={(e) => setProtectionReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300 sm:col-span-2 lg:col-span-3">Membership/admin note
            <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} maxLength={4000} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300 sm:col-span-2 lg:col-span-3">Correction reason — required
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button type="button" onClick={review} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950">Review changes</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      ) : null}
      {editing && reviewing && preview ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-slate-950/60 p-4">
          <h4 className="text-sm font-semibold text-amber-200">Preview changes</h4>
          <div className="mt-3 space-y-2">
            {preview.changes.map((change) => (
              <div key={change.field} className="grid gap-2 rounded-lg border border-slate-800 p-3 text-sm sm:grid-cols-3">
                <span className="text-slate-500">{change.field}</span><span>{show(change.before)}</span><span className="text-amber-200">{show(change.after)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Reason: {reason.trim()}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? "Saving…" : "Confirm & save"}</button>
            <button type="button" disabled={saving} onClick={() => setReviewing(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Back</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
