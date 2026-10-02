"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { openReviewCaseAction, resolveReviewCaseAction } from "../actions";
import {
  REVIEW_CATEGORIES,
  REVIEW_RESOLUTION_OUTCOMES,
  detectReviewConcerns,
} from "../_lib/review-cases";
import type {
  MemberOverview,
  MemberPayment,
  MemberPeriod,
  MemberReviewCase,
} from "../_lib/data";

type Props = {
  member: MemberOverview;
  periods: MemberPeriod[];
  payments: MemberPayment[];
  cases: MemberReviewCase[];
};
const OUTCOME_LABELS: Record<string, string> = {
  CORRECTED_DATA_UPDATED: "Corrected data updated",
  EXISTING_DATA_CONFIRMED: "Existing data confirmed",
  HISTORICAL_DETAIL_UNKNOWN_ACCEPTED: "Reviewed — historical detail unknown/accepted",
};

function categoryLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ReviewCasesPanel({ member, periods, payments, cases }: Props) {
  const router = useRouter();
  const [openForm, setOpenForm] = useState(false);
  const [target, setTarget] = useState("member");
  const [category, setCategory] = useState<(typeof REVIEW_CATEGORIES)[number]>("other");
  const [openingReason, setOpeningReason] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<(typeof REVIEW_RESOLUTION_OUTCOMES)[number]>("EXISTING_DATA_CONFIRMED");
  const [resolutionNote, setResolutionNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const openCase = async () => {
    setSaving(true);
    const membershipPeriodId = target.startsWith("period:") ? target.slice(7) : null;
    const paymentId = target.startsWith("payment:") ? target.slice(8) : null;
    const result = await openReviewCaseAction({
      memberId: member.member_id,
      membershipPeriodId,
      paymentId,
      category,
      reason: openingReason,
    });
    setSaving(false);
    if (!result.ok) { setError(result.message); return; }
    setOpenForm(false);
    setOpeningReason("");
    setError(null);
    router.refresh();
  };

  const resolveCase = async (caseId: string) => {
    setSaving(true);
    const result = await resolveReviewCaseAction({
      caseId,
      memberId: member.member_id,
      outcome,
      note: resolutionNote,
    });
    setSaving(false);
    if (!result.ok) { setError(result.message); return; }
    setResolvingId(null);
    setResolutionNote("");
    setOutcome("EXISTING_DATA_CONFIRMED");
    setError(null);
    router.refresh();
  };

  const openCases = cases.filter((reviewCase) => reviewCase.status === "OPEN");
  const resolvedCases = cases.filter((reviewCase) => reviewCase.status === "RESOLVED");

  return (
    <section className="mt-4 rounded-2xl border border-amber-500/20 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold text-white">Review cases</h2>
        <p className="mt-1 text-xs text-slate-500">Each discrepancy is opened and resolved independently with permanent audit history.</p></div>
        <button type="button" onClick={() => setOpenForm((value) => !value)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-300">Mark In Review</button>
      </div>
      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      {openForm ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Review target
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">
              <option value="member">Member overall</option>
              {periods.map((period) => <option key={period.membership_period_id} value={`period:${period.membership_period_id}`}>Membership period · {period.starts_on ?? "unknown start"}</option>)}
              {payments.map((payment) => <option key={payment.payment_id} value={`payment:${payment.payment_id}`}>Payment · {payment.amount ?? "unknown"} {payment.currency ?? ""}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Category
            <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">
              {REVIEW_CATEGORIES.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300 sm:col-span-2">Reason — required
            <textarea value={openingReason} onChange={(e) => setOpeningReason(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={saving} onClick={openCase} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Open Review case</button>
            <button type="button" disabled={saving} onClick={() => setOpenForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      ) : null}
      <div className="mt-5 space-y-4">
        {openCases.length ? openCases.map((reviewCase) => {
          const linkedPeriod = reviewCase.membership_period_id
            ? periods.find((period) => period.membership_period_id === reviewCase.membership_period_id) ?? null
            : periods.find((period) => period.membership_period_id === member.membership_period_id) ?? null;
          const linkedPayment = reviewCase.payment_id
            ? payments.find((payment) => payment.payment_id === reviewCase.payment_id) ?? null
            : null;
          const concerns = linkedPeriod && (reviewCase.category === "membership" || reviewCase.category === "historical")
            ? detectReviewConcerns({
                firstJoinedOn: member.first_joined_on,
                entitlementType: linkedPeriod.entitlement_type,
                startsOn: linkedPeriod.starts_on,
                expiresOn: linkedPeriod.expires_on,
                expiryMode: linkedPeriod.expiry_mode,
                removalProtected: linkedPeriod.removal_protected,
              })
            : [];
          return (
            <div key={reviewCase.id} className="rounded-xl border border-amber-500/25 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium text-amber-200">{categoryLabel(reviewCase.category)}</p><p className="mt-1 text-sm text-slate-300">{reviewCase.opening_reason}</p></div>
                <span className="rounded-full border border-amber-500/30 px-2 py-1 text-xs text-amber-300">OPEN</span>
              </div>
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 p-3"><span className="text-slate-600">Origin / opened</span><p className="mt-1 text-slate-400">{reviewCase.origin} · {reviewCase.opened_at}</p></div>
                <div className="rounded-lg border border-slate-800 p-3"><span className="text-slate-600">Linked record</span><p className="mt-1 break-all text-slate-400">{reviewCase.membership_period_id ? `period ${reviewCase.membership_period_id}` : reviewCase.payment_id ? `payment ${reviewCase.payment_id}` : "member overall"}</p></div>
              </div>
              {linkedPeriod ? (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-400">
                  <p>Period: {linkedPeriod.starts_on ?? "unknown start"} → {linkedPeriod.expires_on ?? "no known expiry"} · {linkedPeriod.entitlement_type}</p>
                  <p className="mt-1 text-xs text-slate-600">Source: {linkedPeriod.source} · migration_review: {linkedPeriod.migration_review ? "true" : "false"}</p>
                  {linkedPeriod.legacy_notes ? <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">Legacy evidence: {linkedPeriod.legacy_notes}</p> : null}
                </div>
              ) : null}
              {linkedPayment ? <p className="mt-3 rounded-lg border border-slate-800 p-3 text-sm text-slate-400">Payment: {linkedPayment.amount ?? "unknown"} {linkedPayment.currency ?? ""} · {linkedPayment.status} · received {linkedPayment.received_at ?? "unknown"}</p> : null}
              {concerns.length ? <div className="mt-3 space-y-1">{concerns.map((concern) => <p key={concern.code} className="text-xs text-amber-300">• {concern.message}</p>)}</div> : null}
              {resolvingId === reviewCase.id ? (
                <div className="mt-4 grid gap-3 rounded-lg border border-slate-800 p-3">
                  <label className="text-sm text-slate-300">Resolution outcome
                    <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">
                      {REVIEW_RESOLUTION_OUTCOMES.map((value) => <option key={value} value={value}>{OUTCOME_LABELS[value]}</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-slate-300">Resolution note — required
                    <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
                  </label>
                  <p className="text-xs text-slate-600">Unknown historical facts may remain NULL; do not invent dates or payment details.</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={saving} onClick={() => resolveCase(reviewCase.id)} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Resolve Review</button>
                    <button type="button" disabled={saving} onClick={() => setResolvingId(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
                  </div>
                </div>
              ) : <button type="button" onClick={() => { setResolvingId(reviewCase.id); setResolutionNote(""); }} className="mt-4 rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-300">Resolve this case</button>}
            </div>
          );
        }) : <p className="rounded-lg border border-slate-800 p-4 text-sm text-slate-500">No open Review cases.</p>}
      </div>
      {resolvedCases.length ? (
        <details className="mt-5 rounded-xl border border-slate-800 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">Resolved Review history ({resolvedCases.length})</summary>
          <div className="mt-3 space-y-3">
            {resolvedCases.map((reviewCase) => (
              <div key={reviewCase.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
                <p className="text-slate-300">{categoryLabel(reviewCase.category)} · {reviewCase.resolution_outcome ? OUTCOME_LABELS[reviewCase.resolution_outcome] : "Resolved"}</p>
                <p className="mt-1 text-xs text-slate-500">Opened: {reviewCase.opening_reason}</p>
                <p className="mt-1 text-xs text-slate-500">Resolution: {reviewCase.resolution_note ?? "—"}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
