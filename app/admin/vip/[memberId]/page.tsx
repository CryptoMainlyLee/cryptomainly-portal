import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateMembershipNoteAction } from "../actions";
import { hasAdminSession } from "../_lib/auth";
import {
  getMember,
  getMemberHistory,
  getMemberPeriods,
  type MemberHistory,
} from "../_lib/data";
import { membershipEventTitle } from "../_lib/membership-actions";
import MembershipActions from "./MembershipActions";

type Props = {
  params: { memberId: string };
  searchParams?: {
    note?: string;
    action?: string;
    actionError?: string;
  };
};

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function londonToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function titleCase(value: string | null) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-200">{value || "—"}</dd>
    </div>
  );
}

function auditNoteChange(event: MemberHistory) {
  if (event.event_type !== "MEMBERSHIP_NOTE_UPDATED") return null;

  const oldNote =
    typeof event.metadata?.old_note === "string" ? event.metadata.old_note : null;
  const newNote =
    typeof event.metadata?.new_note === "string" ? event.metadata.new_note : null;

  return (
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <p className="uppercase tracking-wider text-slate-600">Previous note</p>
        <p className="mt-1 whitespace-pre-wrap text-slate-400">{oldNote || "Empty"}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <p className="uppercase tracking-wider text-slate-600">New note</p>
        <p className="mt-1 whitespace-pre-wrap text-slate-300">{newNote || "Empty"}</p>
      </div>
    </div>
  );
}

function metadataText(event: MemberHistory, key: string) {
  const value = event.metadata?.[key];
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function historySummary(event: MemberHistory) {
  const amount = metadataText(event, "amount");
  const currency = metadataText(event, "currency");
  const reactivationStart = metadataText(event, "reactivation_start");

  switch (event.event_type) {
    case "EXPIRY_CHANGED":
      return `${formatDate(event.old_expiry)} → ${formatDate(event.new_expiry)}`;
    case "MEMBERSHIP_TIME_ADDED":
      return `+${event.adjustment_value ?? "—"} ${event.adjustment_unit ?? ""} · ${formatDate(
        event.old_expiry
      )} → ${formatDate(event.new_expiry)}`;
    case "MEMBERSHIP_RENEWED":
      return `${amount && currency ? `${amount} ${currency} · ` : ""}${formatDate(
        event.old_expiry
      )} → ${formatDate(event.new_expiry)}`;
    case "MEMBERSHIP_REACTIVATED":
      return `${amount && currency ? `${amount} ${currency} · ` : ""}${formatDate(
        reactivationStart
      )} → ${formatDate(event.new_expiry)}`;
    default:
      return event.old_expiry || event.new_expiry
        ? `${formatDate(event.old_expiry)} → ${formatDate(event.new_expiry)}`
        : null;
  }
}

const ACTION_SUCCESS: Record<string, string> = {
  "expiry-changed": "Expiry changed and permanent audit records were created.",
  "time-added": "Membership time added and permanent audit records were created.",
  renewed: "Paid renewal recorded. Membership, payment and audit records were saved together.",
  reactivated: "Member reactivated with a new paid membership period and permanent audit records.",
};

const ACTION_ERROR: Record<string, string> = {
  stale: "Membership changed since preview — please review again.",
  "past-ack": "Past expiry dates require the additional confirmation acknowledgement.",
  "not-allowed": "That action is no longer allowed for the member's current entitlement state. Refresh and review the record.",
  overlap: "The proposed reactivation would overlap an existing membership period. Review the dates before trying again.",
  invalid: "The membership action was not saved. Check the dates, duration, amount and required reason.",
};

export default async function MemberDetail({ params, searchParams }: Props) {
  if (!(await hasAdminSession())) {
    redirect("/admin/vip/login");
  }

  const [member, periods, history] = await Promise.all([
    getMember(params.memberId),
    getMemberPeriods(params.memberId),
    getMemberHistory(params.memberId),
  ]);

  if (!member) notFound();

  const currentPeriod = periods.find(
    (period) => period.membership_period_id === member.membership_period_id
  );
  const latestHistoricalPeriod =
    member.status === "FORMER"
      ? currentPeriod ?? periods.find((period) => period.period_status === "HISTORICAL") ?? null
      : periods.find((period) => period.period_status === "HISTORICAL") ?? null;
  const todayLondon = londonToday();

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
        <Link
          href="/admin/vip"
          className="text-sm font-medium text-amber-300 hover:text-amber-200"
        >
          ← Back to VIP dashboard
        </Link>

        <header className="mt-5 border-b border-slate-800 pb-6">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300">
            {member.legacy_member_code ?? "Member"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{member.display_name}</h1>
            <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs">
              {member.status}
            </span>
            {member.migration_review ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                Migration review
              </span>
            ) : null}
          </div>
        </header>

        {searchParams?.note === "saved" ? (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Membership note saved. The change was also added to Activity &amp; Audit History.
          </div>
        ) : null}

        {searchParams?.note === "too-long" ? (
          <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Membership notes can contain a maximum of 4,000 characters.
          </div>
        ) : null}

        {searchParams?.action && ACTION_SUCCESS[searchParams.action] ? (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {ACTION_SUCCESS[searchParams.action]}
          </div>
        ) : null}

        {searchParams?.actionError && ACTION_ERROR[searchParams.actionError] ? (
          <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {ACTION_ERROR[searchParams.actionError]}
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="font-semibold text-white">Current membership</h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
              <Detail label="Type" value={member.entitlement_type} />
              <Detail label="Status" value={member.status} />
              <Detail label="Relationship started" value={formatDate(member.first_joined_on)} />
              <Detail label="Entitlement starts" value={formatDate(member.starts_on)} />
              <Detail
                label="Expiry"
                value={
                  member.expiry_mode === "manual_no_expiry"
                    ? "No expiry"
                    : formatDate(member.expires_on)
                }
              />
              <Detail label="Expiry mode" value={member.expiry_mode} />
              <Detail
                label="Removal protected"
                value={member.removal_protected ? "Yes" : "No"}
              />
              <Detail label="Payment records" value={String(member.payment_count)} />
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="font-semibold text-white">Identity &amp; contact</h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
              <Detail label="Telegram" value={member.telegram_username ?? member.telegram_raw} />
              <Detail
                label="Bot linked"
                value={member.telegram_user_id ? "Yes" : "No"}
              />
              <Detail
                label="Telegram user ID"
                value={member.telegram_user_id ? String(member.telegram_user_id) : "—"}
              />
              <Detail
                label="DM available"
                value={member.dm_available ? "Yes" : "No"}
              />
              <Detail label="Email" value={member.email} />
              <Detail label="Marketing" value={member.marketing_status} />
            </dl>
          </div>
        </section>

        <MembershipActions
          memberId={member.member_id}
          status={member.status}
          entitlementType={member.entitlement_type}
          currentPeriodId={member.membership_period_id}
          currentStartsOn={member.starts_on}
          currentExpiresOn={member.expires_on}
          expiryMode={member.expiry_mode}
          latestHistoricalPeriodId={latestHistoricalPeriod?.membership_period_id ?? null}
          latestHistoricalExpiry={latestHistoricalPeriod?.expires_on ?? null}
          todayLondon={todayLondon}
        />

        {member.admin_notes ? (
          <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="font-semibold text-white">Legacy/member notes</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {member.admin_notes}
            </p>
          </section>
        ) : null}

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white">Membership periods</h2>
              <p className="mt-1 text-xs text-slate-500">
                Structured entitlement dates are changed only through the audited Membership Actions panel. Period notes remain editable.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {periods.length} period{periods.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {periods.map((period) => (
              <div
                key={period.membership_period_id}
                className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-100">
                        {formatDate(period.starts_on)} → {period.expiry_mode === "manual_no_expiry" || period.expiry_mode === "lifetime" ? "No expiry" : formatDate(period.expires_on)}
                      </p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          period.period_status === "CURRENT"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-slate-700 bg-slate-800/70 text-slate-400"
                        }`}
                      >
                        {period.period_status}
                      </span>
                      {period.migration_review ? (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                          Legacy review
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {titleCase(period.entitlement_type)} • {period.plan_name ?? "VIP membership"} • {titleCase(period.source)}
                    </p>
                  </div>

                  {period.removal_protected ? (
                    <span className="text-xs text-amber-300">Removal protected</span>
                  ) : null}
                </div>

                {period.legacy_notes ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-600">
                      Legacy source note — read only
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">
                      {period.legacy_notes}
                    </p>
                  </div>
                ) : null}

                <form action={updateMembershipNoteAction} className="mt-4">
                  <input type="hidden" name="memberId" value={member.member_id} />
                  <input
                    type="hidden"
                    name="periodId"
                    value={period.membership_period_id}
                  />
                  <label
                    htmlFor={`note-${period.membership_period_id}`}
                    className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  >
                    Editable membership note
                  </label>
                  <textarea
                    id={`note-${period.membership_period_id}`}
                    name="note"
                    rows={3}
                    maxLength={4000}
                    defaultValue={period.admin_note ?? ""}
                    placeholder="Add useful context for this membership period…"
                    className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-amber-400"
                  />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-600">
                      {period.note_updated_at
                        ? `Last updated ${formatDateTime(period.note_updated_at)} by ${period.note_updated_by ?? "vip-admin"}`
                        : "No editable note saved yet."}
                    </p>
                    <button
                      type="submit"
                      className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/20"
                    >
                      Save note
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Activity &amp; audit history</h2>
              <p className="mt-1 text-xs text-slate-500">
                Permanent record of migrations, original relationship dates, note changes and membership actions.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {history.length} event{history.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {history.length ? (
              history.map((event) => {
                const summary = historySummary(event);
                const relationshipStart = metadataText(event, "original_relationship_start_on");
                const sourceRow = metadataText(event, "source_row");
                return (
                  <div
                    key={event.event_id}
                    className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium text-slate-200">
                        {membershipEventTitle(event.event_type)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {event.event_type === "LEGACY_RELATIONSHIP_STARTED" && relationshipStart
                          ? formatDate(relationshipStart)
                          : formatDateTime(event.occurred_at)}
                      </p>
                    </div>

                    {summary ? (
                      <p className="mt-2 text-sm font-medium text-slate-300">{summary}</p>
                    ) : null}

                    {event.reason ? (
                      <p className="mt-2 text-sm text-slate-400">{event.reason}</p>
                    ) : null}

                    {event.event_type === "LEGACY_RELATIONSHIP_STARTED" ? (
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs leading-5 text-slate-500">
                        Legacy source: Copy of NFT, column B{sourceRow ? `, row ${sourceRow}` : ""}. Historical gaps/lapses are not represented by this date.
                      </div>
                    ) : null}

                    {auditNoteChange(event)}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">No event history recorded.</p>
            )}
          </div>
        </section>

        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          Phase 2 Preview enables audited membership actions and editable period notes. Telegram removal, reminders, campaign sending and payment auto-activation remain disabled.
        </div>
      </div>
    </main>
  );
}
