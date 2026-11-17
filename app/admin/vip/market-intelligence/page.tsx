import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { hasAdminSession } from "../_lib/auth";
import { EDITORIAL_SOURCE_EDITIONS, RESEARCH_EDITIONS } from "../../../vip/market-intelligence/editions";
import visibility from "../../../vip/market-intelligence/visibility.json";

/**
 * Authenticated server-only editorial review. NEVER a live mutation route.
 * Public moderation is still a reviewed, build-time release on this branch.
 * No member data or Telegram actions are invoked.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Research Moderation Review | CryptoMainly",
  robots: {
    index: false, follow: false, nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

const hiddenPostsByEdition = visibility.hidden_post_ids_by_edition as Record<string, string[]>;

export default async function ResearchModerationReview() {
  // The session gate must precede access to the unpublished original data.
  if (!(await hasAdminSession())) redirect("/admin/vip/login");

  const withheldEditions = new Set<string>(visibility.hidden_edition_slugs);
  const publicEditions = new Set<string>(RESEARCH_EDITIONS.map((e) => e.slug));
  const hiddenPosts = EDITORIAL_SOURCE_EDITIONS.reduce((count, edition) => {
    if (withheldEditions.has(edition.slug)) return count + edition.observations.length;
    const removed = new Set(hiddenPostsByEdition[edition.slug] ?? []);
    return count + edition.observations.filter((item) => removed.has(item.id)).length;
  }, 0);

  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-amber-300">
              CryptoMainly · Protected Editorial Review
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Market Intelligence Moderation</h1>
            <p className="mt-2 text-sm text-slate-300">
              Authenticated, read-only preview. No public takedowns, database writes,
              membership actions or Telegram messages can be triggered here.
            </p>
          </div>
          <Link href="/admin/vip" className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:border-amber-300">
            Back to VIP admin
          </Link>
        </header>

        <section aria-label="Publication safeguards"
          className="mb-8 rounded-xl border border-amber-400/40 bg-amber-400/10 p-5">
          <h2 className="font-semibold text-amber-200">Changes require a reviewed deployment</h2>
          <p className="mt-2 text-sm text-slate-200">
            Use the safeguarded local editorial panel to stage withdrawal or restoration.
            Review the reason, Git diff and screenshot quarantine, then run build/route checks
            before authorising any website deployment. Previously published images,
            cached copies or Telegram messages require separate review.
          </p>
        </section>

        <section aria-label="Review counts" className="mb-8 grid gap-4 sm:grid-cols-3">
          {([
            ["Original editions", EDITORIAL_SOURCE_EDITIONS.length],
            ["Visible editions", RESEARCH_EDITIONS.length],
            ["Withheld observations", hiddenPosts],
          ] as const).map(([name, count]) => (
            <div key={name} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
              <p className="text-sm text-slate-400">{name}</p>
              <p className="mt-1 text-3xl font-semibold">{count}</p>
            </div>
          ))}
        </section>

        <section aria-label="Research edition review" className="space-y-6">
          {EDITORIAL_SOURCE_EDITIONS.map((edition) => {
            const editionHidden = !publicEditions.has(edition.slug);
            const removedIds = new Set(hiddenPostsByEdition[edition.slug] ?? []);
            return (
              <article key={edition.slug} className="rounded-xl border border-slate-700 bg-slate-900/70">
                <header className="flex flex-wrap justify-between gap-3 border-b border-slate-700 p-4">
                  <div>
                    <h2 className="font-semibold">{edition.displayDate}</h2>
                    <p className="text-xs text-slate-400">{edition.slug} · {edition.observations.length} originals</p>
                  </div>
                  <span className={editionHidden ? "text-sm text-rose-300" : "text-sm text-emerald-300"}>
                    {editionHidden ? "Entire edition withheld" : "Edition visible"}
                  </span>
                </header>
                <ul className="divide-y divide-slate-700/70">
                  {edition.observations.map((post) => {
                    const removed = editionHidden || removedIds.has(post.id);
                    return (
                      <li key={post.id} className="flex flex-wrap justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{post.title}</p>
                          <p className="mt-1 break-all text-xs text-slate-400">
                            @{post.authorHandle} · {post.id} · {post.publishedDate}
                          </p>
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                             className="mt-2 inline-block text-sm text-sky-300 underline">Original X source</a>
                        </div>
                        <span className={removed ? "text-sm text-rose-300" : "text-sm text-emerald-300"}>
                          {removed ? "WITHHELD from new build" : "Visible in new build"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </section>
        <Link href="/admin/market-intelligence" className="mt-8 inline-block rounded-lg border border-amber-400/60 px-4 py-2 text-sm text-amber-200">Open independent editorial administration →</Link>
        <p className="mt-8 text-sm text-slate-400">
          This review reflects the currently deployed code snapshot only.
          Old Git history, cached pages and previously published PNGs may remain reachable
          until individually remediated.
        </p>
      </div>
    </main>
  );
}
