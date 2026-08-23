import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasAdminSession } from "../_lib/auth";
import { getMember, getMemberHistory } from "../_lib/data";

type Props = {
  params: { memberId: string };
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

export default async function MemberDetail({ params }: Props) {
  if (!(await hasAdminSession())) {
    redirect("/admin/vip/login");
  }

  const [member, history] = await Promise.all([
    getMember(params.memberId),
    getMemberHistory(params.memberId),
  ]);

  if (!member) notFound();

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

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="font-semibold text-white">Membership</h2>
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
            <h2 className="font-semibold text-white">Identity & contact</h2>
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

        {member.admin_notes ? (
          <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="font-semibold text-white">Legacy/admin notes</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {member.admin_notes}
            </p>
          </section>
        ) : null}

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Membership history</h2>
            <span className="text-xs text-slate-500">
              {history.length} event{history.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {history.length ? (
              history.map((event) => (
                <div
                  key={event.event_id}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium text-slate-200">{event.event_type}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(event.occurred_at)}
                    </p>
                  </div>
                  {event.reason ? (
                    <p className="mt-2 text-sm text-slate-400">{event.reason}</p>
                  ) : null}
                  {event.old_expiry || event.new_expiry ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Expiry: {formatDate(event.old_expiry)} →{" "}
                      {formatDate(event.new_expiry)}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No event history recorded.</p>
            )}
          </div>
        </section>

        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          Phase 2A is deliberately read-only. Editing expiry, renewing membership,
          adding time and Telegram actions will be introduced only after this live
          view has been verified.
        </div>
      </div>
    </main>
  );
}
