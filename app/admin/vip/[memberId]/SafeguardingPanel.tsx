"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  blockMemberAction,
  completeSafeguardingTaskAction,
  restoreMemberAccessAction,
  unblockMemberAction,
} from "../actions";
import type { MemberSafeguardingEvent, MemberSafeguardingTask } from "../_lib/data";

type Props = {
  memberId: string;
  safeguardingVersion: number;
  isBlocked: boolean;
  everBlocked: boolean;
  blockedAt: string | null;
  blockedBy: string | null;
  blockedSummary: string | null;
  lastUnblockedAt: string | null;
  lastUnblockedBy: string | null;
  accessRestorationRequired: boolean;
  events: MemberSafeguardingEvent[];
  tasks: MemberSafeguardingTask[];
};

type Mode = "block" | "unblock" | "restore" | null;
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

function TelegramTaskAction({
  memberId,
  task,
}: {
  memberId: string;
  task: MemberSafeguardingTask;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<
    "REMOVED_FROM_TELEGRAM" | "CONFIRMED_NOT_PRESENT_OR_NO_ACCESS"
  >("REMOVED_FROM_TELEGRAM");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (task.status === "COMPLETED") {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm">
        <p className="font-medium text-slate-200">Telegram removal task completed</p>
        <dl className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
          <div><dt className="text-slate-600">Outcome</dt><dd>{task.outcome}</dd></div>
          <div><dt className="text-slate-600">Completed by</dt><dd>{task.completed_by ?? "—"}</dd></div>
          <div><dt className="text-slate-600">Completed at</dt><dd>{formatDateTime(task.completed_at)}</dd></div>
          <div><dt className="text-slate-600">Completion note</dt><dd>{task.completion_note ?? "—"}</dd></div>
        </dl>
      </div>
    );
  }

  const complete = async () => {
    setBusy(true);
    setError(null);
    const result = await completeSafeguardingTaskAction({
      memberId,
      taskId: task.id,
      outcome,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
      <p className="font-medium text-rose-200">Telegram removal required</p>
      <p className="mt-1 text-xs text-rose-100/70">
        This task stays open until you record what happened in Telegram.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">
          <input
            type="radio"
            checked={outcome === "REMOVED_FROM_TELEGRAM"}
            onChange={() => setOutcome("REMOVED_FROM_TELEGRAM")}
          />{" "}Removed from Telegram
        </label>
        <label className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">
          <input
            type="radio"
            checked={outcome === "CONFIRMED_NOT_PRESENT_OR_NO_ACCESS"}
            onChange={() => setOutcome("CONFIRMED_NOT_PRESENT_OR_NO_ACCESS")}
          />{" "}Confirmed not present / no access to remove
        </label>
      </div>
      <label className="mt-3 block text-xs text-slate-400">
        Completion note (optional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200"
        />
      </label>
      {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={complete}
        className="mt-3 rounded-lg border border-rose-400/40 px-3 py-2 text-sm text-rose-200 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Complete Telegram removal task"}
      </button>
    </div>
  );
}

export default function SafeguardingPanel(props: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [reviewing, setReviewing] = useState(false);
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = (nextMode: Exclude<Mode, null>) => {
    setMode(nextMode);
    setReviewing(false);
    setReason("");
    setSummary("");
    setConfirmed(false);
    setError(null);
  };

  const review = () => {
    if (mode === "block" && !summary.trim()) {
      setError("Safeguarding summary is required.");
      return;
    }
    if (!reason.trim()) {
      setError("A full safeguarding reason is required.");
      return;
    }
    setError(null);
    setReviewing(true);
  };

  const submit = async () => {
    if (!mode || !confirmed) return;
    setBusy(true);
    setError(null);
    let result;
    if (mode === "block") {
      result = await blockMemberAction({
        memberId: props.memberId,
        expectedVersion: props.safeguardingVersion,
        summary,
        reason,
        confirmed,
      });
    } else if (mode === "unblock") {
      result = await unblockMemberAction({
        memberId: props.memberId,
        expectedVersion: props.safeguardingVersion,
        reason,
        acknowledged: confirmed,
      });
    } else {
      result = await restoreMemberAccessAction({
        memberId: props.memberId,
        expectedVersion: props.safeguardingVersion,
        reason,
        confirmed,
      });
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMode(null);
    setReviewing(false);
    router.refresh();
  };
  const confirmationText =
    mode === "block"
      ? "I confirm this member must receive no further contact or membership/group access."
      : mode === "unblock"
        ? "I acknowledge that unblocking removes the restriction but does not restore membership or group access."
        : "I confirm I deliberately want to restore access under the existing entitlement and original expiry/lifetime terms.";

  return (
    <section className="mt-4 rounded-2xl border border-rose-500/25 bg-slate-900/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-rose-300">Safeguarding</p>
          <h2 className="mt-1 font-semibold text-white">Relationship restriction &amp; access control</h2>
        </div>
        {props.isBlocked ? (
          <span className="rounded-full border border-rose-400/60 bg-rose-500/20 px-3 py-1 text-xs font-bold tracking-wider text-rose-100">BLOCKED</span>
        ) : props.everBlocked ? (
          <a href="#safeguarding-history" className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">Previously blocked</a>
        ) : null}
      </div>

      {props.isBlocked ? (
        <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
          <p className="font-semibold text-rose-100">No contact. No membership/group access.</p>
          <p className="mt-2 text-sm text-rose-100/80">{props.blockedSummary}</p>
          <p className="mt-2 text-xs text-rose-100/60">
            Blocked {formatDateTime(props.blockedAt)} by {props.blockedBy ?? "—"}
          </p>
        </div>
      ) : props.everBlocked ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          <p className="font-medium text-amber-200">Previously blocked</p>
          <p className="mt-1">Latest unblock: {formatDateTime(props.lastUnblockedAt)} by {props.lastUnblockedBy ?? "—"}</p>
          <a href="#safeguarding-history" className="mt-2 inline-block underline">Safeguarding history</a>
        </div>
      ) : null}

      {props.accessRestorationRequired ? (
        <div className="mt-4 rounded-xl border border-violet-400/40 bg-violet-500/10 p-4">
          <p className="font-semibold text-violet-100">ACCESS RESTORATION REQUIRED</p>
          <p className="mt-1 text-sm text-violet-100/75">
            The safeguarding restriction has ended, but existing membership/group access remains suspended until you deliberately restore it.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {props.isBlocked ? (
          <button type="button" onClick={() => begin("unblock")} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-200">Unblock member</button>
        ) : (
          <button type="button" onClick={() => begin("block")} className="rounded-lg border border-rose-400/40 px-3 py-2 text-sm text-rose-200">Block member</button>
        )}
        {!props.isBlocked && props.accessRestorationRequired ? (
          <button type="button" onClick={() => begin("restore")} className="rounded-lg border border-violet-400/40 px-3 py-2 text-sm text-violet-200">Restore access</button>
        ) : null}
      </div>

      {mode ? (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <h3 className="font-medium text-slate-100">
            {mode === "block" ? "Block member" : mode === "unblock" ? "Unblock member" : "Restore access"}
          </h3>
          {!reviewing ? (
            <div className="mt-3 space-y-3">
              {mode === "block" ? (
                <label className="block text-xs text-slate-400">Safeguarding summary
                  <input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200" />
                </label>
              ) : null}
              <label className="block text-xs text-slate-400">Full safeguarding reason
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200" />
              </label>
              {error ? <p className="text-sm text-rose-200">{error}</p> : null}
              <div className="flex gap-2">
                <button type="button" onClick={review} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-200">Review safeguarding change</button>
                <button type="button" onClick={() => setMode(null)} className="px-3 py-2 text-sm text-slate-400">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              {mode === "block" ? <p><span className="text-slate-500">Summary:</span> {summary}</p> : null}
              <p><span className="text-slate-500">Reason:</span> {reason}</p>
              <label className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-amber-100">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>{confirmationText}</span>
              </label>
              {error ? <p className="text-rose-200">{error}</p> : null}
              <div className="flex gap-2">
                <button type="button" disabled={!confirmed || busy} onClick={submit} className="rounded-lg border border-rose-400/40 px-3 py-2 text-rose-200 disabled:opacity-40">
                  {busy ? "Saving…" : mode === "block" ? "Confirm Block" : mode === "unblock" ? "Confirm Unblock" : "Confirm Restore Access"}
                </button>
                <button type="button" disabled={busy} onClick={() => { setReviewing(false); setConfirmed(false); }} className="px-3 py-2 text-slate-400">Back</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {props.tasks.length ? (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-medium text-slate-200">Safeguarding tasks</h3>
          {props.tasks.map((task) => <TelegramTaskAction key={task.id} memberId={props.memberId} task={task} />)}
        </div>
      ) : null}
      <div id="safeguarding-history" className="mt-5 border-t border-slate-800 pt-4">
        <h3 className="text-sm font-medium text-slate-200">Safeguarding history</h3>
        <div className="mt-3 space-y-2">
          {props.events.length ? props.events.map((event) => (
            <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-slate-200">{event.event_type.replaceAll("_", " ")}</span>
                <span>{formatDateTime(event.occurred_at)}</span>
              </div>
              {event.summary ? <p className="mt-2 text-slate-300">{event.summary}</p> : null}
              {event.reason ? <p className="mt-1 whitespace-pre-wrap">{event.reason}</p> : null}
              <p className="mt-1 text-slate-600">Actor: {event.actor_id}</p>
            </div>
          )) : <p className="text-xs text-slate-500">No safeguarding events recorded.</p>}
        </div>
      </div>
    </section>
  );
}
