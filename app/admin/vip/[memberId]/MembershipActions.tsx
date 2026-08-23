"use client";

import { useState } from "react";
import { addTimeAction, changeExpiryAction, renewMembershipAction } from "../actions";
import {
  buildAddTimePreview,
  buildChangeExpiryPreview,
  buildRenewPreview,
  getMembershipActionEligibility,
  normalizeCurrency,
  normalizeOptionalText,
  validatePositiveWholeNumber,
  validateReason,
  validateRenewAmount,
  type DurationUnit,
} from "../_lib/membership-actions";

type Props = {
  memberId: string;
  status: "ACTIVE" | "FORMER" | "LIFETIME";
  entitlementType: "paid" | "complimentary" | "trial" | "lifetime" | "admin" | null;
  currentPeriodId: string | null;
  currentStartsOn: string | null;
  currentExpiresOn: string | null;
  expiryMode: "fixed" | "lifetime" | "manual_no_expiry" | null;
  latestHistoricalPeriodId: string | null;
  latestHistoricalExpiry: string | null;
  todayLondon: string;
};

type ActionKind = "change-expiry" | "add-time" | "renew";

type DurationChoice = {
  value: number;
  unit: DurationUnit;
  label: string;
};

const ADD_TIME_PRESETS: DurationChoice[] = [
  { value: 7, unit: "days", label: "+7 days" },
  { value: 14, unit: "days", label: "+14 days" },
  { value: 1, unit: "months", label: "+1 month" },
  { value: 3, unit: "months", label: "+3 months" },
  { value: 6, unit: "months", label: "+6 months" },
  { value: 12, unit: "months", label: "+12 months" },
];

const RENEW_PRESETS: DurationChoice[] = [
  { value: 1, unit: "months", label: "1 month" },
  { value: 3, unit: "months", label: "3 months" },
  { value: 6, unit: "months", label: "6 months" },
  { value: 12, unit: "months", label: "12 months" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function actionButtonClass(enabled: boolean, selected: boolean) {
  if (!enabled) {
    return "cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-left text-sm text-slate-600";
  }
  if (selected) {
    return "rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-left text-sm font-medium text-amber-200";
  }
  return "rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-left text-sm font-medium text-slate-200 transition hover:border-amber-400/40 hover:text-amber-200";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </span>
  );
}

function DurationButtons({
  presets,
  value,
  unit,
  onChange,
}: {
  presets: DurationChoice[];
  value: number;
  unit: DurationUnit;
  onChange: (value: number, unit: DurationUnit) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const selected = preset.value === value && preset.unit === unit;
        return (
          <button
            key={`${preset.unit}-${preset.value}`}
            type="button"
            onClick={() => onChange(preset.value, preset.unit)}
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              selected
                ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

export default function MembershipActions(props: Props) {
  const eligibility = getMembershipActionEligibility({
    status: props.status,
    entitlementType: props.entitlementType,
    expiryMode: props.expiryMode,
    expiresOn: props.currentExpiresOn,
  });

  const [actionKind, setActionKind] = useState<ActionKind | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [changeExpiry, setChangeExpiry] = useState(props.currentExpiresOn ?? "");
  const [changeReason, setChangeReason] = useState("");

  const [addValue, setAddValue] = useState(1);
  const [addUnit, setAddUnit] = useState<DurationUnit>("months");
  const [addReason, setAddReason] = useState("");

  const [renewValue, setRenewValue] = useState(12);
  const [renewUnit, setRenewUnit] = useState<DurationUnit>("months");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USDT");
  const [paymentDate, setPaymentDate] = useState(props.todayLondon);
  const [reactivationStart, setReactivationStart] = useState(props.todayLondon);
  const [txHash, setTxHash] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [renewReason, setRenewReason] = useState("");

  const selectAction = (next: ActionKind) => {
    setActionKind(next);
    setReviewing(false);
    setFormError(null);
  };

  const closeAction = () => {
    setActionKind(null);
    setReviewing(false);
    setFormError(null);
  };

  const reviewChangeExpiry = () => {
    try {
      validateReason(changeReason);
      if (!props.currentExpiresOn || !props.currentPeriodId) throw new Error("No fixed current membership period is available.");
      const preview = buildChangeExpiryPreview({
        currentExpiry: props.currentExpiresOn,
        newExpiry: changeExpiry,
        todayLondon: props.todayLondon,
      });
      if (preview.oldExpiry === preview.newExpiry) throw new Error("Choose a different expiry date.");
      setFormError(null);
      setReviewing(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the form and try again.");
    }
  };

  const reviewAddTime = () => {
    try {
      validateReason(addReason);
      validatePositiveWholeNumber(addValue);
      if (!props.currentExpiresOn || !props.currentPeriodId) throw new Error("No fixed current membership period is available.");
      buildAddTimePreview({ currentExpiry: props.currentExpiresOn, value: addValue, unit: addUnit });
      setFormError(null);
      setReviewing(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the form and try again.");
    }
  };

  const reviewRenew = () => {
    try {
      validateReason(renewReason);
      validatePositiveWholeNumber(renewValue);
      validateRenewAmount(amount);
      normalizeCurrency(currency);
      normalizeOptionalText(txHash, 200);
      normalizeOptionalText(paymentNote, 2000);
      if (!paymentDate) throw new Error("Payment date is required.");

      const mode = eligibility.renew.mode;
      if (mode === "active-renewal") {
        if (!props.currentExpiresOn || !props.currentPeriodId) throw new Error("No active paid membership period is available.");
        buildRenewPreview({ mode, baseDate: props.currentExpiresOn, value: renewValue, unit: renewUnit });
      } else if (mode === "reactivation") {
        if (!reactivationStart) throw new Error("Reactivation start date is required.");
        if (reactivationStart > props.todayLondon) throw new Error("Reactivation start cannot be in the future.");
        buildRenewPreview({ mode, baseDate: reactivationStart, value: renewValue, unit: renewUnit });
      } else {
        throw new Error("Paid Renew is not available for this entitlement.");
      }

      setFormError(null);
      setReviewing(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the form and try again.");
    }
  };

  const changePreview =
    reviewing && actionKind === "change-expiry" && props.currentExpiresOn
      ? buildChangeExpiryPreview({
          currentExpiry: props.currentExpiresOn,
          newExpiry: changeExpiry,
          todayLondon: props.todayLondon,
        })
      : null;

  const addPreview =
    reviewing && actionKind === "add-time" && props.currentExpiresOn
      ? buildAddTimePreview({ currentExpiry: props.currentExpiresOn, value: addValue, unit: addUnit })
      : null;

  const renewMode = eligibility.renew.mode;
  const renewBaseDate = renewMode === "reactivation" ? reactivationStart : props.currentExpiresOn;
  const renewPreview =
    reviewing && actionKind === "renew" && renewBaseDate && renewMode !== "unavailable"
      ? buildRenewPreview({ mode: renewMode, baseDate: renewBaseDate, value: renewValue, unit: renewUnit })
      : null;

  return (
    <section className="mt-4 rounded-2xl border border-amber-500/20 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-white">Membership Actions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Every action is previewed before saving and creates a permanent audit record.
          </p>
        </div>
        <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-1 text-[11px] text-amber-200/80">
          Expiry remains authoritative
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <button
            type="button"
            disabled={!eligibility.changeExpiry.enabled}
            onClick={() => selectAction("change-expiry")}
            className={`${actionButtonClass(eligibility.changeExpiry.enabled, actionKind === "change-expiry")} w-full`}
          >
            Change Expiry
          </button>
          {!eligibility.changeExpiry.enabled && eligibility.changeExpiry.reason ? (
            <p className="mt-1 text-[11px] text-slate-600">{eligibility.changeExpiry.reason}</p>
          ) : null}
        </div>
        <div>
          <button
            type="button"
            disabled={!eligibility.addTime.enabled}
            onClick={() => selectAction("add-time")}
            className={`${actionButtonClass(eligibility.addTime.enabled, actionKind === "add-time")} w-full`}
          >
            Add Time
          </button>
          {!eligibility.addTime.enabled && eligibility.addTime.reason ? (
            <p className="mt-1 text-[11px] text-slate-600">{eligibility.addTime.reason}</p>
          ) : null}
        </div>
        <div>
          <button
            type="button"
            disabled={!eligibility.renew.enabled}
            onClick={() => selectAction("renew")}
            className={`${actionButtonClass(eligibility.renew.enabled, actionKind === "renew")} w-full`}
          >
            {eligibility.renew.mode === "reactivation" ? "Renew / Reactivate" : "Renew"}
          </button>
          {!eligibility.renew.enabled && eligibility.renew.reason ? (
            <p className="mt-1 text-[11px] text-slate-600">{eligibility.renew.reason}</p>
          ) : null}
        </div>
      </div>

      {actionKind ? (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          {formError ? (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {formError}
            </div>
          ) : null}

          {actionKind === "change-expiry" ? (
            !reviewing ? (
              <div className="space-y-4">
                <div>
                  <FieldLabel>New expiry date</FieldLabel>
                  <input
                    type="date"
                    value={changeExpiry}
                    onChange={(event) => setChangeExpiry(event.target.value)}
                    className="mt-2 block w-full max-w-xs rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-400"
                  />
                  <p className="mt-1 text-xs text-slate-600">Current expiry: {formatDate(props.currentExpiresOn)}</p>
                </div>
                <div>
                  <FieldLabel>Reason — required</FieldLabel>
                  <textarea
                    value={changeReason}
                    onChange={(event) => setChangeReason(event.target.value)}
                    maxLength={500}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-400"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={reviewChangeExpiry} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">
                    Review change
                  </button>
                  <button type="button" onClick={closeAction} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
                </div>
              </div>
            ) : changePreview ? (
              <form action={changeExpiryAction} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <FieldLabel>Current expiry</FieldLabel>
                    <p className="mt-1 text-sm text-slate-200">{formatDate(changePreview.oldExpiry)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <FieldLabel>Proposed expiry</FieldLabel>
                    <p className="mt-1 text-sm text-amber-200">{formatDate(changePreview.newExpiry)}</p>
                  </div>
                </div>
                <div>
                  <FieldLabel>Reason</FieldLabel>
                  <p className="mt-1 text-sm text-slate-300">{validateReason(changeReason)}</p>
                </div>
                {changePreview.requiresPastExpiryAcknowledgement ? (
                  <label className="flex gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                    <input type="checkbox" name="pastAcknowledged" value="true" required className="mt-0.5" />
                    <span><strong>This change will make the member expired immediately.</strong><br />I understand and want to continue.</span>
                  </label>
                ) : (
                  <input type="hidden" name="pastAcknowledged" value="false" />
                )}
                <input type="hidden" name="memberId" value={props.memberId} />
                <input type="hidden" name="periodId" value={props.currentPeriodId ?? ""} />
                <input type="hidden" name="expectedExpiry" value={props.currentExpiresOn ?? ""} />
                <input type="hidden" name="newExpiry" value={changePreview.newExpiry} />
                <input type="hidden" name="reason" value={validateReason(changeReason)} />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">Confirm Change Expiry</button>
                  <button type="button" onClick={() => setReviewing(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Back</button>
                </div>
              </form>
            ) : null
          ) : null}

          {actionKind === "add-time" ? (
            !reviewing ? (
              <div className="space-y-4">
                <div>
                  <FieldLabel>Time to add</FieldLabel>
                  <div className="mt-2">
                    <DurationButtons presets={ADD_TIME_PRESETS} value={addValue} unit={addUnit} onChange={(value, unit) => { setAddValue(value); setAddUnit(unit); }} />
                  </div>
                  <div className="mt-3 flex max-w-sm gap-2">
                    <input type="number" min={1} step={1} value={addValue} onChange={(event) => setAddValue(Number(event.target.value))} className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
                    <select value={addUnit} onChange={(event) => setAddUnit(event.target.value as DurationUnit)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                      <option value="days">days</option>
                      <option value="months">months</option>
                    </select>
                  </div>
                </div>
                <div>
                  <FieldLabel>Reason — required</FieldLabel>
                  <textarea value={addReason} onChange={(event) => setAddReason(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-400" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={reviewAddTime} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">Review change</button>
                  <button type="button" onClick={closeAction} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
                </div>
              </div>
            ) : addPreview ? (
              <form action={addTimeAction} className="space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-slate-200">
                  {formatDate(addPreview.oldExpiry)} + {addPreview.value} {addPreview.unit} → <strong className="text-amber-200">{formatDate(addPreview.newExpiry)}</strong>
                </div>
                <div><FieldLabel>Reason</FieldLabel><p className="mt-1 text-sm text-slate-300">{validateReason(addReason)}</p></div>
                <input type="hidden" name="memberId" value={props.memberId} />
                <input type="hidden" name="periodId" value={props.currentPeriodId ?? ""} />
                <input type="hidden" name="expectedExpiry" value={props.currentExpiresOn ?? ""} />
                <input type="hidden" name="durationValue" value={addPreview.value} />
                <input type="hidden" name="durationUnit" value={addPreview.unit} />
                <input type="hidden" name="reason" value={validateReason(addReason)} />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">Confirm Add Time</button>
                  <button type="button" onClick={() => setReviewing(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Back</button>
                </div>
              </form>
            ) : null
          ) : null}

          {actionKind === "renew" ? (
            !reviewing ? (
              <div className="space-y-4">
                {renewMode === "reactivation" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label><FieldLabel>Payment date</FieldLabel><input type="date" value={paymentDate} onChange={(event) => { setPaymentDate(event.target.value); if (reactivationStart === props.todayLondon) setReactivationStart(event.target.value); }} className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                    <label><FieldLabel>Reactivation start</FieldLabel><input type="date" value={reactivationStart} max={props.todayLondon} onChange={(event) => setReactivationStart(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                  </div>
                ) : (
                  <label className="block max-w-xs"><FieldLabel>Payment date</FieldLabel><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                )}
                <div>
                  <FieldLabel>Membership duration</FieldLabel>
                  <div className="mt-2"><DurationButtons presets={RENEW_PRESETS} value={renewValue} unit={renewUnit} onChange={(value, unit) => { setRenewValue(value); setRenewUnit(unit); }} /></div>
                  <div className="mt-3 flex max-w-sm gap-2">
                    <input type="number" min={1} step={1} value={renewValue} onChange={(event) => setRenewValue(Number(event.target.value))} className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
                    <select value={renewUnit} onChange={(event) => setRenewUnit(event.target.value as DurationUnit)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"><option value="days">days</option><option value="months">months</option></select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                  <label><FieldLabel>Amount paid — required</FieldLabel><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500" className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                  <label><FieldLabel>Currency</FieldLabel><input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={12} className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                </div>
                <label className="block"><FieldLabel>Transaction hash — optional</FieldLabel><input value={txHash} onChange={(event) => setTxHash(event.target.value)} maxLength={200} className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                <label className="block"><FieldLabel>Payment note — optional</FieldLabel><textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} maxLength={2000} rows={2} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                <label className="block"><FieldLabel>Reason — required</FieldLabel><textarea value={renewReason} onChange={(event) => setRenewReason(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" /></label>
                <div className="flex gap-2">
                  <button type="button" onClick={reviewRenew} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">Review renewal</button>
                  <button type="button" onClick={closeAction} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
                </div>
              </div>
            ) : renewPreview ? (
              <form action={renewMembershipAction} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <FieldLabel>{renewMode === "reactivation" ? "Previous expiry" : "Current expiry"}</FieldLabel>
                    <p className="mt-1 text-sm text-slate-200">{renewMode === "reactivation" ? formatDate(props.latestHistoricalExpiry) : formatDate(props.currentExpiresOn)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <FieldLabel>{renewMode === "reactivation" ? "New membership period" : "Result"}</FieldLabel>
                    <p className="mt-1 text-sm text-amber-200">{renewMode === "reactivation" ? `${formatDate(reactivationStart)} → ` : ""}{formatDate(renewPreview.newExpiry)}</p>
                  </div>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><FieldLabel>Payment</FieldLabel><p className="mt-1 text-slate-300">{validateRenewAmount(amount)} {normalizeCurrency(currency)}</p></div>
                  <div><FieldLabel>Payment date</FieldLabel><p className="mt-1 text-slate-300">{formatDate(paymentDate)}</p></div>
                  <div><FieldLabel>Duration</FieldLabel><p className="mt-1 text-slate-300">{renewValue} {renewUnit}</p></div>
                  <div><FieldLabel>Reason</FieldLabel><p className="mt-1 text-slate-300">{validateReason(renewReason)}</p></div>
                </div>
                <input type="hidden" name="memberId" value={props.memberId} />
                <input type="hidden" name="mode" value={renewMode} />
                <input type="hidden" name="durationValue" value={renewValue} />
                <input type="hidden" name="durationUnit" value={renewUnit} />
                <input type="hidden" name="amount" value={validateRenewAmount(amount)} />
                <input type="hidden" name="currency" value={normalizeCurrency(currency)} />
                <input type="hidden" name="paymentDate" value={paymentDate} />
                <input type="hidden" name="txHash" value={txHash} />
                <input type="hidden" name="paymentNote" value={paymentNote} />
                <input type="hidden" name="reason" value={validateReason(renewReason)} />
                {renewMode === "active-renewal" ? (
                  <>
                    <input type="hidden" name="periodId" value={props.currentPeriodId ?? ""} />
                    <input type="hidden" name="expectedExpiry" value={props.currentExpiresOn ?? ""} />
                  </>
                ) : (
                  <>
                    <input type="hidden" name="expectedLatestPeriodId" value={props.latestHistoricalPeriodId ?? ""} />
                    <input type="hidden" name="expectedLatestExpiry" value={props.latestHistoricalExpiry ?? ""} />
                    <input type="hidden" name="reactivationStart" value={reactivationStart} />
                  </>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">{renewMode === "reactivation" ? "Confirm Reactivation" : "Confirm Renewal"}</button>
                  <button type="button" onClick={() => setReviewing(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Back</button>
                </div>
              </form>
            ) : null
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
