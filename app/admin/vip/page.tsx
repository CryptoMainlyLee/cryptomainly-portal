import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminSession } from "./_lib/auth";
import { getMembers, type MemberOverview } from "./_lib/data";
import { logoutAction } from "./actions";

type Props = {
  searchParams?: {
    status?: string;
    type?: string;
    review?: string;
    q?: string;
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

function badgeClass(status: string) {
  if (status === "ACTIVE") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }
  if (status === "LIFETIME") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }
  return "border-slate-600 bg-slate-700/40 text-slate-300";
}

function typeLabel(type: MemberOverview["entitlement_type"]) {
  if (!type) return "Unknown";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function filterMembers(members: MemberOverview[], params: Props["searchParams"]) {
  const status = params?.status?.toUpperCase();
  const type = params?.type?.toLowerCase();
  const review = params?.review;
  const query = params?.q?.trim().toLowerCase();

  return members.filter((member) => {
    if (status && status !== "ALL" && member.status !== status) return false;
    if (type && type !== "all" && member.entitlement_type !== type) return false;
    if (review === "1" && !member.migration_review) return false;
    if (query) {
      const haystack = [
        member.display_name,
        member.legacy_member_code,
        member.telegram_username,
        member.telegram_raw,
        member.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export default async function VipAdminDashboard({ searchParams }: Props) {
  if (!(await hasAdminSession())) {
    redirect("/admin/vip/login");
  }

  const members = await getMembers();
  const filtered = filterMembers(members, searchParams);

  const active = members.filter((m) => m.status === "ACTIVE").length;
  const former = members.filter((m) => m.status === "FORMER").length;
  const paidActive = members.filter(
    (m) => m.status === "ACTIVE" && m.entitlement_type === "paid"
  ).length;
  const compActive = members.filter(
    (m) => m.status === "ACTIVE" && m.entitlement_type === "complimentary"
  ).length;
  const review = members.filter((m) => m.migration_review).length;
  const botLinked = members.filter(
    (m) => m.status === "ACTIVE" && m.telegram_user_id
  ).length;

  const cards = [
    ["Active VIP", active, "Current entitlement"],
    ["Paid Active", paidActive, "Paid memberships"],
    ["Complimentary", compActive, "Current free access"],
    ["Former VIP", former, "Retained for CRM"],
    ["Review Flags", review, "Legacy cleanup"],
    ["Bot Linked", botLinked, "Active numeric Telegram IDs"],
  ] as const;

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="mb-7 flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
              CryptoMainly
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              VIP Membership Admin
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Phase 2 • read-only • live Supabase data
            </p>
          </div>

          <form action={logoutAction}>
            <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
              Sign out
            </button>
          </form>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {cards.map(([label, value, note]) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
            >
              <p className="text-xs uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{note}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 p-4">
            <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
              <input
                name="q"
                defaultValue={searchParams?.q}
                placeholder="Search member, Telegram, email…"
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-amber-400"
              />

              <select
                name="status"
                defaultValue={searchParams?.status ?? "ALL"}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="FORMER">Former</option>
                <option value="LIFETIME">Lifetime</option>
              </select>

              <select
                name="type"
                defaultValue={searchParams?.type ?? "all"}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              >
                <option value="all">All types</option>
                <option value="paid">Paid</option>
                <option value="complimentary">Complimentary</option>
                <option value="trial">Trial</option>
                <option value="lifetime">Lifetime</option>
                <option value="admin">Admin</option>
              </select>

              <button className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-300">
                Filter
              </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link
                href="/admin/vip"
                className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300"
              >
                Clear filters
              </Link>
              <Link
                href="/admin/vip?status=ACTIVE"
                className="rounded-full border border-emerald-500/30 px-3 py-1.5 text-emerald-300"
              >
                Active only
              </Link>
              <Link
                href="/admin/vip?review=1"
                className="rounded-full border border-amber-500/30 px-3 py-1.5 text-amber-300"
              >
                Review queue
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Telegram</th>
                  <th className="px-4 py-3">Bot</th>
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((member) => (
                  <tr key={member.member_id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {member.display_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {member.legacy_member_code ?? member.member_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(
                          member.status
                        )}`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {typeLabel(member.entitlement_type)}
                      {member.removal_protected ? (
                        <div className="mt-1 text-xs text-amber-300">Protected</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {member.expiry_mode === "manual_no_expiry"
                        ? "No expiry"
                        : formatDate(member.expires_on)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {member.telegram_username ??
                        member.telegram_raw ??
                        "Not recorded"}
                    </td>
                    <td className="px-4 py-3">
                      {member.telegram_user_id ? (
                        <span className="text-emerald-300">Linked</span>
                      ) : (
                        <span className="text-slate-500">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {member.migration_review ? (
                        <span className="text-amber-300">Review</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/vip/${member.member_id}`}
                        className="font-medium text-amber-300 hover:text-amber-200"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No members match those filters.
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
            Showing {filtered.length} of {members.length} members
          </div>
        </section>

        <p className="mt-5 text-center text-xs text-slate-600">
          Read-only safety mode. No expiry, Telegram, payment or membership writes
          are available in Phase 2A.
        </p>
      </div>
    </main>
  );
}
