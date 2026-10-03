"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { correctPaymentAction } from "../actions";
import {
  buildChangeSet,
  isoToLondonLocalDateTime,
  londonLocalDateTimeToIso,
  validatePaymentDraft,
} from "../_lib/member-editing";
import type { MemberPayment } from "../_lib/data";

type Props = { memberId: string; payment: MemberPayment };

function show(value: unknown) {
  if (value === null || value === "") return "Unknown / blank";
  return String(value);
}

function expectedState(payment: MemberPayment) {
  return {
    amount: payment.amount,
    currency: payment.currency,
    network: payment.network,
    tx_hash: payment.tx_hash,
    status: payment.status,
    received_at: payment.received_at,
    notes: payment.notes,
  };
}

export default function PaymentEditor({ memberId, payment }: Props) {
  const router = useRouter();
  const expected = expectedState(payment);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [amount, setAmount] = useState(payment.amount === null ? "" : String(payment.amount));
  const [currency, setCurrency] = useState(payment.currency ?? "");
  const [network, setNetwork] = useState(payment.network ?? "");
  const [txHash, setTxHash] = useState(payment.tx_hash ?? "");
  const [status, setStatus] = useState(payment.status);
  const [receivedLocal, setReceivedLocal] = useState(isoToLondonLocalDateTime(payment.received_at));
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<null | {
    proposed: ReturnType<typeof validatePaymentDraft>;
    changes: ReturnType<typeof buildChangeSet>;
  }>(null);

  const review = () => {
    try {
      const receivedAt = londonLocalDateTimeToIso(receivedLocal);
      const next = validatePaymentDraft({
        amount, currency, network, txHash, status, receivedAt, notes,
      });
      const after = {
        amount: next.amount, currency: next.currency, network: next.network,
        tx_hash: next.txHash, status: next.status,
        received_at: next.receivedAt, notes: next.notes,
      };
      const changes = buildChangeSet(expected, after);
      if (!changes.length) throw new Error("No payment correction to review.");
      if (!reason.trim()) throw new Error("A correction reason is required.");
      setPreview({ proposed: next, changes });
      setReviewing(true); setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the payment and try again.");
    }
  };
  const save = async () => {
    if (!preview) return;
    setSaving(true);
    const result = await correctPaymentAction({
      memberId,
      paymentId: payment.payment_id,
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
        <div><p className="font-medium text-slate-100">{payment.amount ?? "Unknown"} {payment.currency ?? ""}</p>
        <p className="mt-1 text-xs text-slate-500">{payment.status} · received {payment.received_at ?? "unknown"}</p></div>
        {!editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-300">Edit payment</button> : null}
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div><dt className="text-slate-600">payment_id · read only</dt><dd className="break-all text-slate-400">{payment.payment_id}</dd></div>
        <div><dt className="text-slate-600">verification_method · read only</dt><dd className="text-slate-400">{payment.verification_method}</dd></div>
        <div><dt className="text-slate-600">verified_by / verified_at · read only</dt><dd className="text-slate-400">{payment.verified_by ?? "—"} · {payment.verified_at ?? "—"}</dd></div>
      </dl>
      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      {editing && !reviewing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-slate-300">Amount
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Currency
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={12} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Status
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">
              {['pending','verified','rejected','refunded'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Network
            <input value={network} onChange={(e) => setNetwork(e.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Transaction hash
            <input value={txHash} onChange={(e) => setTxHash(e.target.value)} maxLength={300} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
          </label>
          <label className="text-sm text-slate-300">Received date/time · Europe/London
            <input type="datetime-local" value={receivedLocal} onChange={(e) => setReceivedLocal(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
            <span className="mt-1 block text-[11px] text-slate-600">Leave blank when historically unknown.</span>
          </label>
          <label className="text-sm text-slate-300 sm:col-span-2 lg:col-span-3">Payment notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" />
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
