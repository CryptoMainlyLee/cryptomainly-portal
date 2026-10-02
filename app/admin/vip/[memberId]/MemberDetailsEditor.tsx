"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateMemberDetailsAction } from "../actions";
import {
  buildChangeSet,
  requiresStructuralReason,
  validateMemberDetailsDraft,
} from "../_lib/member-editing";

type Props = {
  memberId: string;
  displayName: string;
  email: string | null;
  firstJoinedOn: string | null;
  adminNotes: string | null;
  marketingStatus: "unknown" | "allowed" | "opted_out";
};

function show(value: unknown) {
  if (value === null || value === "") return "Unknown / blank";
  return String(value);
}
export default function MemberDetailsEditor(props: Props) {
  const router = useRouter();
  const expected = {
    display_name: props.displayName,
    email: props.email,
    first_joined_on: props.firstJoinedOn,
    admin_notes: props.adminNotes,
    marketing_status: props.marketingStatus,
  };
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [displayName, setDisplayName] = useState(props.displayName);
  const [email, setEmail] = useState(props.email ?? "");
  const [firstJoinedOn, setFirstJoinedOn] = useState(props.firstJoinedOn ?? "");
  const [adminNotes, setAdminNotes] = useState(props.adminNotes ?? "");
  const [marketingStatus, setMarketingStatus] = useState(props.marketingStatus);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflictMemberId, setConflictMemberId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);


  const [preview, setPreview] = useState<null | {
    proposed: ReturnType<typeof validateMemberDetailsDraft>;
    changes: ReturnType<typeof buildChangeSet>;
  }>(null);

  const reviewChanges = () => {
    try {
      const next = validateMemberDetailsDraft({
        displayName, email, firstJoinedOn, adminNotes, marketingStatus,
      });
      const changes = buildChangeSet(expected, {
        display_name: next.displayName,
        email: next.email,
        first_joined_on: next.firstJoinedOn,
        admin_notes: next.adminNotes,
        marketing_status: next.marketingStatus,
      });
      if (!changes.length) throw new Error("No changes to review.");
      if (requiresStructuralReason(changes.map((change) => change.field)) && !reason.trim()) {
        throw new Error("A reason is required for relationship-date corrections.");
      }
      setPreview({ proposed: next, changes });
      setError(null);
      setConflictMemberId(null);
      setReviewing(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the fields and try again.");
    }
  };
  const save = async () => {
    if (!preview) return;
    setSaving(true);
    const result = await updateMemberDetailsAction({
      memberId: props.memberId,
      expected,
      proposed: preview.proposed,
      reason,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      setConflictMemberId("existingMemberId" in result ? result.existingMemberId ?? null : null);
      return;
    }
    setConflictMemberId(null);
    setEditing(false);
    setReviewing(false);
    setPreview(null);
    setReason("");
    setError(null);
    router.refresh();
  };

  if (!editing) {
    return (
      <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="font-semibold text-white">Member details</h2>
          <p className="mt-1 text-xs text-slate-500">Audited identity and contact corrections.</p></div>
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-300">Edit</button>
        </div>
      </section>
    );
  }
  return (
    <section className="mt-4 rounded-2xl border border-amber-500/20 bg-slate-900/70 p-5">
      <h2 className="font-semibold text-white">Edit member details</h2>
      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}{conflictMemberId ? <> <Link className="underline" href={`/admin/vip/${conflictMemberId}`}>Open existing member</Link></> : null}</p> : null}
      {!reviewing ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">First joined date
            <input type="date" value={firstJoinedOn} onChange={(e) => setFirstJoinedOn(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Marketing status
            <select value={marketingStatus} onChange={(e) => setMarketingStatus(e.target.value as Props["marketingStatus"])} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">
              <option value="unknown">Unknown</option><option value="allowed">Allowed</option><option value="opted_out">Opted out</option>
            </select>
          </label>
        </div>
      ) : null}
      {!reviewing ? (
        <>
          <label className="mt-4 block text-sm text-slate-300">Admin/member notes
            <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} maxLength={4000} rows={4} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="mt-4 block text-sm text-slate-300">Reason {firstJoinedOn !== (props.firstJoinedOn ?? "") ? "— required" : "— optional"}
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={reviewChanges} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950">Review changes</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
          </div>
        </>
      ) : preview ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-amber-200">Preview changes</h3>
          <div className="mt-3 space-y-2">
            {preview.changes.map((change) => (
              <div key={change.field} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm sm:grid-cols-3">
                <span className="text-slate-500">{change.field}</span><span>{show(change.before)}</span><span className="text-amber-200">{show(change.after)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Reason: {reason.trim() || "Not required for this contact-only correction."}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? "Saving…" : "Confirm & save"}</button>
            <button type="button" disabled={saving} onClick={() => setReviewing(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Back</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
