# CryptoMainly Blocked Member Safeguarding — Design Spec

Date: 2026-10-03
Status: Design sections approved in chat; written specification awaiting approval

## Purpose

Add a durable safeguarding capability to the CryptoMainly VIP Membership Admin so an administrator can permanently prohibit contact and membership/group access for a member without deleting identity, entitlement, Review, payment, Telegram, or audit history.

`Blocked` is a relationship-level safeguarding state. It is not a membership status, marketing preference, Review state, or removal-protection flag.

The capability must make accidental return difficult: a Blocked person cannot be reactivated, invited, contacted, recreated as a duplicate member, or granted access by future automation unless the administrator deliberately unblocks the existing member record. Unblocking alone never restores access.

## Authoritative baseline

This design extends the verified Universal Member Editing & Review Preview at branch `feature/universal-member-editing-review-2026-10-02`, commit `d25742334618d1fa74d6362e2eedc63c248a29ee`.

Production `main` remains at Add Member release commit `38c5b789ced9809a360c37e5ba7c66f6f3ddd355`; this design does not authorize a merge or Production deployment.

The production Universal Editing migration is already applied and has 26 OPEN legacy Review cases for exactly 26 flagged membership periods. Those cases and flags remain untouched until individually reconciled.

Existing automation switches remain OFF. This feature does not enable reminders, removals, campaigns, or payment activation.

## Core principles

1. Membership entitlement and safeguarding are independent truths.
2. `ACTIVE`, `FORMER`, and `LIFETIME` continue to describe factual entitlement only.
3. `Blocked` determines whether contact or access is permitted.
4. Blocking never deletes a member and never rewrites historical entitlement facts.
5. Blocking overrides contact eligibility without changing `marketing_status`.
6. `removal_protected` keeps its existing meaning and is unrelated to safeguarding.
7. Review remains a separate data-reconciliation workflow; Blocked never opens, closes, or bulk-resolves Review cases.
8. Protected system IDs remain read-only. Telegram username remains editable; numeric Telegram user ID remains read-only.
9. Membership expiry remains authoritative. Time spent Blocked is not automatically added back.
10. Every Block, Unblock, Restore Access, and Telegram-removal completion is attributable and auditable.
11. Audit/history is append-only. Later actions never erase prior safeguarding events.
12. No migration may infer that a real member should be Blocked.

## Chosen architecture

Use a dedicated safeguarding subsystem alongside membership and Review.

The three independent operational dimensions are:
- **Entitlement:** `ACTIVE`, `FORMER`, or `LIFETIME`.
- **Reconciliation:** zero or more OPEN/RESOLVED Review cases.
- **Safeguarding:** Blocked/unblocked plus any access-restoration requirement.

The subsystem has four responsibilities: current safeguarding state, append-only safeguarding events, protected strong identifiers, and safeguarding tasks.

Use the following conceptual table boundaries so the implementation plan has one source of truth:
- `member_safeguarding_state` — one current-state row per member
- `member_safeguarding_events` — append-only safeguarding history
- `member_protected_identifiers` — durable strong-identifier ownership/history
- `member_safeguarding_tasks` — current/completed operational safeguarding tasks

## Current safeguarding state

Maintain one authoritative current-state row for each member used by the admin system.

Required state includes at least:
- member ID
- `is_blocked`
- current block timestamp, actor, and concise visible summary while blocked
- `access_restoration_required`
- latest unblock timestamp and actor where applicable
- concurrency/version value for stale-write protection
- created/updated timestamps

A blocked member may validly be `ACTIVE + BLOCKED`, `FORMER + BLOCKED`, or `LIFETIME + BLOCKED`.

After an ACTIVE or LIFETIME member is unblocked, `access_restoration_required=true` until a separate Restore Access action succeeds. This state is not a membership status and is not a Review case.

If a fixed-term entitlement expires while Blocked or while access restoration is pending, factual membership status naturally becomes FORMER. Because expiry is date-driven and may occur without a write, the effective relationship policy must immediately treat `access_restoration_required` as false whenever current status is FORMER, even if a stored flag has not yet been normalized. The UI must not offer Restore Access, and any later return uses the normal deliberate Reactivation flow. The next authorized safeguarding/membership mutation may normalize the stored flag to false without creating a fictitious Restore Access event.

The migration must backfill a neutral, unblocked safeguarding-state row for every existing member, but it must not create Block events or infer restrictions. Newly-created members must receive the same neutral safeguarding state transactionally so the one-row-per-member invariant is preserved.

## Safeguarding event history

Create append-only safeguarding events for meaningful transitions and task outcomes.

Event types include at minimum:
- `MEMBER_BLOCKED`
- `MEMBER_UNBLOCKED`
- `MEMBER_ACCESS_RESTORED`
- `TELEGRAM_REMOVAL_REQUIRED`
- `TELEGRAM_REMOVAL_COMPLETED`
- `TELEGRAM_NO_ACCESS_CONFIRMED`
- `PROTECTED_IDENTIFIER_CAPTURED` when a new protected strong identifier is added after the initial Block capture

Every event records the member, event type, actor, timestamp, reason where required, and relevant metadata. Block events retain both the concise visible summary and the fuller immutable reason.

Safeguarding events supplement rather than replace the existing general audit/history. Each safeguarding mutation must also write the appropriate general audit record in the same transaction.

Unblocking never deletes or rewrites the original Block event. Re-blocking later creates a new Block event and a new safeguarding cycle.

## Protected strong identifiers

Maintain a durable protected-identifier ledger tied to the canonical member record.

Strong identifier types are:
- normalized email
- normalized Telegram username
- numeric Telegram user ID when verified/available

On first Block, capture every strong identifier currently known for that member without inventing missing values.

If a member who has ever been Blocked later receives an audited email or Telegram-username correction, preserve the previous strong identifier and protect the new strong identifier as belonging to the same canonical member. Future verified numeric Telegram IDs for such a member must also join the protected identity history.

Unblocking never releases protected identifiers. Historical protected identifiers continue to route duplicate attempts to the existing member record.

An identifier must not silently become protected for two different member records. A collision discovered during capture or correction is a hard conflict requiring deliberate investigation; the system must not guess which identity is correct.

Display names are never strong identifiers. Exact or similar display-name matches remain warnings/review signals only and cannot by themselves Block a person or create a safeguarding identity match.

The ledger must record the capture source, such as current identity at Block time or an audited correction, so historical identity facts are not fabricated.

## Safeguarding tasks

Create explicit safeguarding tasks for manual operational work that the current system cannot yet automate.

The first task type is Telegram removal.

When an ACTIVE or LIFETIME member is Blocked, always create an OPEN Telegram-removal task because the current database cannot reliably prove absence from the Telegram groups.

When a FORMER member is Blocked, create the task only when existing records provide evidence they may still have Telegram access. For this release, qualifying evidence is `telegram_user_id IS NOT NULL`, `linked_at IS NOT NULL`, or `dm_available=true`. A Telegram username alone, or `bot_started_at` alone, is not proof of current group access.

The task remains OPEN until the administrator explicitly completes it with one of two outcomes:
- `REMOVED_FROM_TELEGRAM`
- `CONFIRMED_NOT_PRESENT_OR_NO_ACCESS`

Completion records actor and timestamp and permits an optional note. Completion never changes the Blocked state itself.

A later Block cycle creates a new task where the rules require one; old completed tasks remain historical.

Phase 3 Telegram automation may later replace the manual operation, but it must reuse the same safeguarding state and task semantics rather than creating a second Blocked concept.

## Block transition

Blocking requires:
- a concise admin-visible safeguarding summary
- a fuller mandatory reason
- explicit confirmation of the action

The transaction must atomically set the current state to Blocked, clear any obsolete access-restoration requirement, capture known strong identifiers, create the Block event and general audit entry, and create any required Telegram-removal task/event.

While Blocked:
- no contact, campaign, reminder, invite, Telegram-link/access grant, membership extension, renewal, reactivation, or Restore Access may succeed
- factual corrections to identity/contact data remain allowed
- factual membership/payment corrections remain allowed under existing rules
- Review cases remain independently editable/resolvable
- underlying membership dates and factual entitlement status remain unchanged

Blocking does not set `marketing_status=opted_out`; Blocked simply overrides contact eligibility operationally.

Blocking does not set `ended_early_on`, change expiry, or destroy a lifetime entitlement. The safeguard suspends usable access without falsifying entitlement history.

Blocking an already Blocked member is rejected as an invalid/stale transition.

## Unblock transition

Unblocking requires:
- a mandatory reason
- an explicit acknowledgement that the permanent no-contact/no-access restriction is being removed
- acknowledgement that membership and Telegram/group access are not automatically restored

The transaction sets `is_blocked=false`, records latest unblock actor/time, clears current-block-only presentation fields, and creates immutable Unblock safeguarding/general-audit events.

For an ACTIVE or LIFETIME entitlement, unblocking sets `access_restoration_required=true`.

For a FORMER member, unblocking does not create an access-restoration requirement because there is no active entitlement to resume. A future return uses the normal Reactivation workflow.

Unblocking an already unblocked member is rejected.

The member detail page retains a visible `Previously blocked` marker after unblocking, including latest unblock date and a path to safeguarding history.

## Restore Access transition

Restore Access is available only when all of the following are true:
- member is not currently Blocked
- `access_restoration_required=true`
- an ACTIVE or LIFETIME entitlement still exists
- the administrator supplies a mandatory reason
- the administrator explicitly confirms the intent to resume access under the existing entitlement

For a fixed-term ACTIVE entitlement, Restore Access resumes eligibility under the original unchanged expiry date. Time spent Blocked is not credited automatically.

For LIFETIME, Restore Access resumes eligibility under the existing lifetime entitlement.

Restore Access clears `access_restoration_required` and creates immutable safeguarding/general-audit events. It does not create a new membership period.

Before Phase 3 Telegram automation exists, Restore Access means the safeguarding suspension is lifted and access may be restored through the normal/manual operational route; the action does not pretend that Telegram membership was automatically granted.

Restore Access must reject if the fixed-term entitlement has already expired, if no restoration requirement exists, or if the member is Blocked. An expired member must use normal Reactivation after unblocking.

Normal membership actions must not be usable to bypass a pending access-restoration requirement for an ACTIVE/LIFETIME member.

## Effective relationship policy

Expose a shared server-side policy derived from current safeguarding state and entitlement facts so downstream features do not reimplement Blocked rules independently.

At minimum the policy should make these facts easy to consume:
- `contact_allowed`
- `access_grant_allowed`
- `membership_action_allowed`
- `access_restoration_required`
- current Blocked state and reason-summary metadata needed by admin UI

`contact_allowed` is always false while Blocked. When unblocked, normal marketing/contact rules apply; an access-restoration requirement does not itself recreate the no-contact restriction.

`access_grant_allowed` is false while Blocked and false while `access_restoration_required=true`. It becomes true only when safeguarding permits access and entitlement rules independently permit it.

`membership_action_allowed` must prevent relationship-granting actions while Blocked and must prevent ACTIVE/LIFETIME renewal/extension paths from bypassing a pending Restore Access decision. FORMER members who have been deliberately unblocked may use the normal Reactivation flow.

## Add Member and identity enforcement

Add Member must continue its existing duplicate checks and add safeguarding-aware protected-identifier checks before creation.

Exact normalized matches on email or Telegram username are hard stops. A future flow that receives numeric Telegram user ID must apply the same rule to that identifier.

If a strong identifier matches a currently Blocked member, creation is an absolute hard stop with no Add Member override. The UI must identify the existing Blocked record and direct the administrator there.

If a strong identifier matches protected identity history for an unblocked, previously Blocked member, creation is still a hard duplicate stop and must route to the existing canonical member record. Unblocking does not make a second member identity legitimate.

Similar or exact display-name matches remain warning-only under the existing acknowledgement model and do not become safeguarding hard stops.

The server-side create RPC must enforce the final duplicate/protected-identifier decision. Client-side preflight alone is insufficient.

Identity/contact editing must also reject a new email or Telegram username that is protected for another member. For a member with Block history, an audited correction must preserve both the old and new strong identifiers for identity continuity.

## Enforcement boundaries

Blocked enforcement must exist at the server/database boundary. Hiding or disabling a button is never sufficient protection.

Dedicated safeguarding RPCs must be the only supported way to Block, Unblock, Restore Access, and complete safeguarding tasks.

Existing or revised membership RPCs must independently reject prohibited renewal, reactivation, and extension operations when safeguarding disallows them.

Future Telegram linking/invitation/access-grant code must reject Blocked members before performing any external action. Campaigns, reminders, and direct-contact automation must likewise treat Blocked as an overriding prohibition.

The current automation switches remain OFF throughout this release; adding enforcement does not enable those systems.

Factual editing remains available while Blocked because keeping canonical identity and history accurate strengthens safeguarding. Existing validation, stale-write protection, and audit requirements remain in force.

## Database and security design

Safeguarding tables must use explicit primary keys, foreign keys to the canonical member/event records where applicable, check constraints for controlled state/outcome values, and indexes that match the admin lookup/enforcement paths.

Foreign-key columns used for joins/enforcement must be indexed. Uniqueness for protected normalized identifiers must prevent silent cross-member reuse; any pre-existing conflict discovered during migration or capture must fail safely rather than be auto-merged.

RLS must be enabled on safeguarding tables. Direct privileges are denied to `public`, `anon`, and `authenticated` roles. Admin mutations are exposed only through narrowly-scoped `SECURITY DEFINER` RPCs executed by the existing service-role-backed server boundary, with a fixed safe `search_path`.

Each mutation RPC must validate input, require the expected current state/version, lock/read the authoritative state, reject stale or contradictory transitions, perform all state/event/audit/task writes in one transaction, and return safe application error codes for expected conflicts.

No browser/client receives service-role credentials.

Schema migrations must use valid PostgreSQL migration patterns and explicit constraint existence checks where idempotent protection is required; do not rely on unsupported `ADD CONSTRAINT IF NOT EXISTS` syntax.

## Admin list UI

Keep factual membership status visible and unchanged. Blocked is additive.

A member row can therefore display `ACTIVE` plus a prominent `BLOCKED` badge rather than replacing ACTIVE with a fourth membership status.

Add a dedicated Blocked count/filter while keeping Blocked members inside their factual ACTIVE/FORMER/LIFETIME filters. Preserve `Clear filters` as the final quick action; the intended order becomes `Add Member → Active only → Review queue → Blocked → Clear filters`.

## Member detail UI

When currently Blocked, show a high-visibility safeguarding panel near the top of the member record, before ordinary membership actions. It must show:
- prominent `BLOCKED` state
- concise safeguarding summary
- blocked date and actor
- explicit message: `No contact. No membership/group access.`
- any OPEN Telegram-removal task
- the dedicated Unblock action

Ordinary relationship-granting controls should remain visible enough to explain why they are unavailable, with messaging such as `Unavailable while this member is Blocked`, rather than silently disappearing.

Safeguarding controls live in their own section. Do not mix Block/Unblock/Restore Access into ordinary membership correction forms.

After unblocking, remove the current Blocked warning and show `Previously blocked` with latest unblock date and a path to safeguarding history.

If `access_restoration_required=true`, show a prominent `ACCESS RESTORATION REQUIRED` state and the dedicated Restore Access action. The member must not regain usable access merely because the Block was removed.

Telegram-removal task completion must offer exactly the two approved outcomes and show the resulting immutable history after completion.

## Review isolation

Blocked must not create, resolve, suppress, or rewrite Review cases.

The 26 existing OPEN legacy Review cases remain OPEN until each is individually reconciled under the existing workflow.

The existing resolution outcome `Reviewed — historical detail unknown/accepted` remains available and unchanged.

A member may simultaneously be Blocked and In Review. Factual correction and Review resolution remain allowed while Blocked.

No safeguarding migration or action clears `migration_review` except through the existing linked Review-resolution rules.

## Error handling and transition guards

Expected invalid states must fail closed with safe, specific application errors rather than partial writes.

Examples:
- Block already Blocked member → reject
- Unblock already unblocked member → reject
- Restore Access while Blocked → reject
- Restore Access without a pending restoration requirement → reject
- Restore Access after fixed-term expiry → reject and direct to Reactivation
- complete an already-completed Telegram-removal task → reject
- protected identifier belongs to another member → reject as identity conflict
- submitted safeguarding version is stale → reject and require refresh/review

A failed transaction must not leave state without its matching event/audit/task records.

## Verification requirements

Database verification must cover:
- neutral migration/backfill creates no Block decisions
- Block, Unblock, Restore Access state transitions
- Telegram-removal task creation rules for ACTIVE/LIFETIME and evidence-based FORMER cases
- both Telegram task completion outcomes
- protected current and historical identifier matching
- cross-member protected-identifier conflicts
- stale-state and contradictory-transition rejection
- service-role-only RPC execution and table privilege/RLS boundaries
- full rollback on induced failure
- no mutation of existing Review cases/flags except through existing Review RPCs

Application/Node tests must cover eligibility policy, Add Member hard stops, factual-edit allowances, pending-restoration restrictions, expiry-during-suspension behavior, and display-name warning-only behavior.

UI smoke tests must cover Blocked badges/filter, member-detail safeguarding panel, Block confirmation, Telegram-removal completion, Unblock acknowledgement, Previously blocked state, Restore Access confirmation, existing Add Member flow, and existing Review flow.

Regression verification must keep the existing Universal Editing, Add Member, and Phase 2 suites passing, extending them only where the safeguarding rule deliberately changes an allowed action.

The existing Preview character-encoding defects must be corrected before Production rollout:
- `â€”` must render as `—`
- `View â†’` must render as `View →`

Those display fixes are release prerequisites but are not part of the safeguarding data model.

## Rollout sequence and invariants

The implementation plan must preserve a staged rollout:
1. implement and test in the isolated feature worktree/branch
2. apply the safeguarding migration to the intended environment with no real member auto-Blocked
3. verify schema, privileges, neutral backfill, RPC boundaries, and unchanged business data
4. deploy a Vercel Preview
5. exercise a synthetic Block → Telegram task → Unblock → Restore Access lifecycle
6. remove all synthetic/test records and verify audit-safe cleanup strategy before Production approval
7. rerun database, Node, TypeScript, build, smoke, and diff checks
8. present the final Preview for explicit approval before any merge/push to `main`

Production rollout verification must confirm:
- member counts remain factually consistent with entitlement data
- all 26 existing Review cases and their original `migration_review` flags remain intact unless individually resolved through the existing workflow
- Blackwolf remains complimentary with start `2026-08-23` and expiry `2027-02-23`
- all four automation switches remain OFF
- no synthetic/test members remain
- no real member is Blocked merely because the migration ran

Zeb is the motivating safeguarding example, but the migration must not automatically Block Zeb or any other real person. Each real Block decision is an explicit admin action after the capability is available.

## Non-goals for this release

This release does not:
- enable automated Telegram removal or invitations
- enable campaign sending, reminders, payment auto-activation, or other automation
- create a second membership-status model
- auto-Block members based on notes, names, Review state, marketing status, or legacy flags
- use display-name similarity as a safeguarding identity match
- delete members or rewrite historical events/audit records
- bulk-clear Review cases or migration flags
- restore expired entitlements through the safeguarding workflow

## Acceptance criteria

The design is satisfied when:
- Blocked is a distinct, highly visible member-level safeguarding state
- ACTIVE/FORMER/LIFETIME reporting remains factually unchanged
- Blocked always prohibits both contact and access-granting actions
- Block/Unblock/Restore Access each require the approved confirmations/reasons and produce immutable history
- unblocking ACTIVE/LIFETIME never restores access automatically
- Restore Access resumes only the existing still-valid entitlement with no automatic time credit
- Add Member cannot recreate a Blocked or previously Blocked identity through current or protected strong identifiers
- historical protected identifiers remain tied to the canonical member after unblocking
- Telegram manual removal is tracked to an explicit audited outcome where required
- factual corrections and Review reconciliation remain possible while Blocked
- server-side checks prevent UI or future integrations from bypassing safeguarding
- all current production invariants, Review data, Blackwolf data, and OFF automation settings survive rollout unchanged
- Production merge remains gated on explicit Preview approval
