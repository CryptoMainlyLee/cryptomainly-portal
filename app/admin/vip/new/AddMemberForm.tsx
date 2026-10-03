"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkNewMemberDuplicatesAction,
  createNewMemberAction,
} from "../actions";
import { addMembershipDuration, type DurationUnit } from "../_lib/membership-actions";
import type { NewMemberDraft, NewMemberPreview } from "../_lib/new-member";

type Props = { initialStartDate: string };
type SimilarMatch = { memberId: string; displayName: string };
type HardMatch = SimilarMatch & {
  field: "email" | "telegram";
  matchSource: "current" | "protected_history";
  safeguarding: "blocked" | "previously_blocked" | null;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-amber-400";
const labelClass = "text-xs font-medium uppercase tracking-wider text-slate-500";

function initialDraft(startDate: string): NewMemberDraft {
  return {
    displayName: "",
    email: "",
    telegramUsername: "",
    entitlementType: "paid",
    startDate,
    durationValue: 1,
    durationUnit: "months",
    manualExpiry: "",
    expiryOverrideReason: "",
    reason: "",
    amount: "",
    currency: "USDT",
    paymentDate: "",
    txHash: "",
    paymentNote: "",
    similarNameAcknowledged: false,
  };
}
function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-600">{label}</p>
      <div className="mt-1 text-sm text-slate-200">{value || "—"}</div>
    </div>
  );
}

export default function AddMemberForm({ initialStartDate }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<NewMemberDraft>(() => initialDraft(initialStartDate));
  const [stage, setStage] = useState<"details" | "review">("details");
  const [review, setReview] = useState<NewMemberPreview | null>(null);
  const [similarMatches, setSimilarMatches] = useState<SimilarMatch[]>([]);
  const [hardMatches, setHardMatches] = useState<HardMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const calculatedExpiry = useMemo(() => {
    try {
      const value = Number(draft.durationValue);
      if (!draft.startDate || !Number.isInteger(value) || value <= 0) return "";
      if (draft.durationUnit !== "days" && draft.durationUnit !== "months") return "";
      return addMembershipDuration(
        draft.startDate,
        value,
        draft.durationUnit as DurationUnit
      );
    } catch {
      return "";
    }
  }, [draft.startDate, draft.durationValue, draft.durationUnit]);

  const hasBlockedHardMatch = hardMatches.some((match) => match.safeguarding === "blocked");
  const hasProtectedHardMatch = hardMatches.some((match) => match.matchSource === "protected_history");
  const finalExpiry = draft.manualExpiry.trim() || calculatedExpiry;
  const expiryOverridden = Boolean(
    draft.manualExpiry.trim() && calculatedExpiry && draft.manualExpiry.trim() !== calculatedExpiry
  );
  function setField<K extends keyof NewMemberDraft>(key: K, value: NewMemberDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setHardMatches([]);
  }

  function setEntitlementType(value: string) {
    setDraft((current) =>
      value === "paid"
        ? { ...current, entitlementType: value, currency: current.currency || "USDT" }
        : {
            ...current,
            entitlementType: value,
            amount: "",
            currency: "",
            paymentDate: "",
            txHash: "",
            paymentNote: "",
          }
    );
    setError(null);
    setHardMatches([]);
  }

  async function handleReview(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setHardMatches([]);
    const candidate = { ...draft, similarNameAcknowledged: false };
    const result = await checkNewMemberDuplicatesAction(candidate);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.duplicates.hardMatches.length > 0) {
      setHardMatches(result.duplicates.hardMatches);
      setError("A matching email or Telegram username already belongs to an existing member.");
      return;
    }

    setDraft(candidate);
    setReview(result.preview);
    setSimilarMatches(result.duplicates.similarNameMatches);
    setStage("review");
  }
  async function handleCreate() {
    if (!review) return;
    if (similarMatches.length > 0 && !draft.similarNameAcknowledged) {
      setError("Confirm that this is genuinely a new person before creating the member.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await createNewMemberAction(draft);
    setBusy(false);

    if (result.ok) {
      router.push(`/admin/vip/${result.memberId}?action=member-created`);
      return;
    }

    setError(result.message);
    if ("hardMatches" in result && result.hardMatches) {
      setHardMatches(result.hardMatches as HardMatch[]);
    }
    if (result.code === "SIMILAR_NAME_ACK_REQUIRED" && "similarNameMatches" in result) {
      setSimilarMatches(result.similarNameMatches as SimilarMatch[]);
    }
  }

  function backToDetails() {
    setStage("details");
    setReview(null);
    setError(null);
  }

  if (stage === "review" && review) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              Step 2 of 2
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">Review before save</h2>
          </div>
          <span className="text-xs text-slate-500">No database write has happened yet.</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Display name" value={review.displayName} />
          <SummaryItem label="Email" value={review.email} />
          <SummaryItem
            label="Telegram"
            value={review.telegramUsername ? `@${review.telegramUsername}` : "Not recorded"}
          />
          <SummaryItem label="Membership type" value={review.entitlementType} />
          <SummaryItem label="Start date" value={review.startDate} />
          <SummaryItem
            label="Duration"
            value={`${review.durationValue} ${review.durationUnit}`}
          />
          <SummaryItem label="Calculated expiry" value={review.calculatedExpiry} />
          <SummaryItem
            label="Final authoritative expiry"
            value={review.finalExpiry}
          />
          <SummaryItem
            label="Expiry override"
            value={review.expiryOverridden ? review.expiryOverrideReason : "No"}
          />
          <SummaryItem label="Admin reason" value={review.reason} />
          <SummaryItem
            label="Telegram status"
            value={review.telegramUsername ? "Not linked — username only" : "Not linked"}
          />
          {review.entitlementType === "paid" ? (
            <SummaryItem
              label="Payment"
              value={`${review.amount} ${review.currency}${review.paymentDate ? ` · ${review.paymentDate}` : " · date not supplied"}`}
            />
          ) : null}
        </div>
        {similarMatches.length > 0 ? (
          <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-medium text-amber-200">Possible existing member name</p>
            <p className="mt-1 text-sm text-amber-100/80">
              These are warnings only. Check the records before confirming this is a new person.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {similarMatches.map((match) => (
                <Link
                  key={match.memberId}
                  href={`/admin/vip/${match.memberId}`}
                  target="_blank"
                  className="rounded-lg border border-amber-400/30 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/10"
                >
                  {match.displayName} ↗
                </Link>
              ))}
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm text-amber-100">
              <input
                type="checkbox"
                checked={draft.similarNameAcknowledged}
                onChange={(event) =>
                  setField("similarNameAcknowledged", event.target.checked)
                }
                className="mt-1 h-4 w-4 accent-amber-400"
              />
              <span>I have checked these records and confirm this is genuinely a new person.</span>
            </label>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={backToDetails}
            disabled={busy}
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-500 disabled:opacity-50"
          >
            Edit details
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || (similarMatches.length > 0 && !draft.similarNameAcknowledged)}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Creating…" : "Confirm & create member"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleReview}
      className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          Step 1 of 2
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">Enter member details</h2>
        <p className="mt-1 text-sm text-slate-500">
          Duplicate checks run before you can review or save the new record.
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={labelClass}>Display name *</span>
          <input
            required
            maxLength={200}
            value={draft.displayName}
            onChange={(event) => setField("displayName", event.target.value)}
            className={inputClass}
            placeholder="Member name"
          />
        </label>
        <label>
          <span className={labelClass}>Telegram username</span>
          <input
            value={draft.telegramUsername}
            onChange={(event) => setField("telegramUsername", event.target.value)}
            className={inputClass}
            placeholder="@username (optional)"
          />
        </label>
        <label>
          <span className={labelClass}>Email</span>
          <input
            type="email"
            value={draft.email}
            onChange={(event) => setField("email", event.target.value)}
            className={inputClass}
            placeholder="name@example.com (optional)"
          />
        </label>
      </div>

      <div className="my-6 border-t border-slate-800" />

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={labelClass}>Membership type *</span>
          <select
            value={draft.entitlementType}
            onChange={(event) => setEntitlementType(event.target.value)}
            className={inputClass}
          >
            <option value="paid">Paid</option>
            <option value="complimentary">Complimentary</option>
            <option value="trial">Trial</option>
          </select>
        </label>
        <label>
          <span className={labelClass}>Start date *</span>
          <input
            type="date"
            required
            value={draft.startDate}
            onChange={(event) => setField("startDate", event.target.value)}
            className={inputClass}
          />
        </label>

        <div className="sm:col-span-2">
          <span className={labelClass}>Duration *</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 3, 6, 12].map((months) => (
              <button
                key={months}
                type="button"
                onClick={() => {
                  setField("durationValue", months);
                  setField("durationUnit", "months");
                }}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  draft.durationUnit === "months" && Number(draft.durationValue) === months
                    ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {months} month{months === 1 ? "" : "s"}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
            <input
              type="number"
              min={1}
              step={1}
              required
              value={draft.durationValue}
              onChange={(event) => setField("durationValue", event.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400"
            />
            <select
              value={draft.durationUnit}
              onChange={(event) => setField("durationUnit", event.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400"
            >
              <option value="months">Months</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
        <div>
          <span className={labelClass}>Calculated expiry</span>
          <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300">
            {calculatedExpiry || "Enter a valid start date and duration"}
          </div>
        </div>
        <label>
          <span className={labelClass}>Manual expiry override</span>
          <input
            type="date"
            value={draft.manualExpiry}
            onChange={(event) => setField("manualExpiry", event.target.value)}
            className={inputClass}
          />
        </label>

        <div className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-slate-600">Final authoritative expiry</p>
          <p className="mt-1 text-lg font-semibold text-white">{finalExpiry || "—"}</p>
        </div>

        {expiryOverridden ? (
          <label className="sm:col-span-2">
            <span className={labelClass}>Reason for expiry override *</span>
            <textarea
              required
              maxLength={500}
              rows={2}
              value={draft.expiryOverrideReason}
              onChange={(event) => setField("expiryOverrideReason", event.target.value)}
              className={inputClass}
              placeholder="Why the final expiry differs from the calculated date"
            />
          </label>
        ) : null}

        <label className="sm:col-span-2">
          <span className={labelClass}>Membership / admin reason *</span>
          <textarea
            required
            maxLength={500}
            rows={3}
            value={draft.reason}
            onChange={(event) => setField("reason", event.target.value)}
            className={inputClass}
            placeholder="Why this membership is being created"
          />
        </label>
      </div>
      {draft.entitlementType === "paid" ? (
        <>
          <div className="my-6 border-t border-slate-800" />
          <div>
            <h3 className="font-semibold text-white">Payment</h3>
            <p className="mt-1 text-xs text-slate-500">
              Payment date is optional. Leaving it blank will not invent a received date.
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Amount paid *</span>
              <input
                type="number"
                min="0.00000001"
                step="any"
                required
                value={draft.amount}
                onChange={(event) => setField("amount", event.target.value)}
                className={inputClass}
                placeholder="100"
              />
            </label>
            <label>
              <span className={labelClass}>Currency *</span>
              <input
                required
                maxLength={12}
                value={draft.currency}
                onChange={(event) => setField("currency", event.target.value)}
                className={inputClass}
              />
            </label>
            <label>
              <span className={labelClass}>Payment date</span>
              <input
                type="date"
                value={draft.paymentDate}
                onChange={(event) => setField("paymentDate", event.target.value)}
                className={inputClass}
              />
            </label>
            <label>
              <span className={labelClass}>Transaction hash</span>
              <input
                maxLength={300}
                value={draft.txHash}
                onChange={(event) => setField("txHash", event.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </label>
            <label className="sm:col-span-2">
              <span className={labelClass}>Payment note</span>
              <textarea
                maxLength={2000}
                rows={2}
                value={draft.paymentNote}
                onChange={(event) => setField("paymentNote", event.target.value)}
                className={inputClass}
                placeholder="Optional payment context"
              />
            </label>
          </div>
        </>
      ) : null}

      {hardMatches.length > 0 ? (
        <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="font-medium text-rose-200">
            {hasBlockedHardMatch
              ? "Blocked member match"
              : hasProtectedHardMatch
                ? "Protected identity match"
                : "Existing member match"}
          </p>
          <p className="mt-1 text-sm text-rose-100/80">
            {hasBlockedHardMatch
              ? "No new member can be created, reactivated or invited. Open the existing Blocked record and keep the safeguarding restriction in place."
              : hasProtectedHardMatch
                ? "Use the existing canonical member record. This identity is retained in safeguarding history; do not create a duplicate."
                : "Do not create a duplicate. Open the existing record and renew/reactivate it if appropriate."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hardMatches.map((match) => (
              <Link
                key={`${match.memberId}-${match.field}-${match.matchSource}`}
                href={`/admin/vip/${match.memberId}`}
                className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-400/10"
              >
                {match.displayName} · {match.field}
                {match.safeguarding === "blocked" ? " · BLOCKED" : ""}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Checking…" : "Review member"}
        </button>
      </div>
    </form>
  );
}
