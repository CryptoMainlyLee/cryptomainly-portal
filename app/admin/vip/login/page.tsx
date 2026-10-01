import { redirect } from "next/navigation";
import { hasAdminSession } from "../_lib/auth";
import { loginAction } from "../actions";

type Props = {
  searchParams?: { error?: string };
};

export const dynamic = "force-dynamic";

export default async function VipAdminLogin({ searchParams }: Props) {
  if (await hasAdminSession()) {
    redirect("/admin/vip");
  }

  const failed = searchParams?.error === "1";

  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/50 bg-amber-400/10 text-2xl">
            👑
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
            CryptoMainly
          </p>
          <h1 className="mt-2 text-3xl font-semibold">VIP Membership Admin</h1>
          <p className="mt-2 text-sm text-slate-400">
            Private administration area. Phase 2 is read-only.
          </p>
        </div>

        <form
          action={loginAction}
          className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6 shadow-2xl shadow-black/20"
        >
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Admin password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none ring-0 transition focus:border-amber-400"
          />

          {failed ? (
            <p className="mt-3 text-sm text-rose-300">
              Password not recognised.
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-5 w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Open dashboard
          </button>
        </form>
      </div>
    </main>
  );
}
