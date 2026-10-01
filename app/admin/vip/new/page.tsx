import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminSession } from "../_lib/auth";
import AddMemberForm from "./AddMemberForm";

export const dynamic = "force-dynamic";

function londonToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function AddMemberPage() {
  if (!(await hasAdminSession())) redirect("/admin/vip/login");

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-7 sm:px-6">
        <Link href="/admin/vip" className="text-sm font-medium text-amber-300 hover:text-amber-200">
          ← Back to VIP dashboard
        </Link>

        <header className="mt-5 border-b border-slate-800 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
            CryptoMainly
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Add Member</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Create a genuinely new Paid, Complimentary or Trial member. Existing members should
            be renewed or reactivated from their current record instead.
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">
          Expiry remains authoritative. Nothing is saved until the final confirmation step.
        </div>

        <AddMemberForm initialStartDate={londonToday()} />
      </div>
    </main>
  );
}
