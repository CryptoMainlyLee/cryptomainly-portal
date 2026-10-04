# CryptoMainly Phase 3A — Verified Telegram Identity Linking Design

Date: 2026-10-04
Status: Drafted from approved design; awaiting written-spec review

## Purpose

Phase 3A adds a secure way to bind one real Telegram account to one canonical CryptoMainly member record.

The feature verifies Telegram identity only. It does not grant, invite, remove, restore, or otherwise change access to any Telegram group.

The verified numeric Telegram user ID is authoritative. Telegram usernames remain mutable reference/contact data and are never treated as proof of identity.

## Authoritative baseline

This design starts from Production `main` commit `d8cbf7095bae4f4cd5bbbf0db767e653e25002b8`, the merged blocked-member safeguarding release.

At design time, Production has 77 members, 19 ACTIVE, 58 FORMER, zero OPEN Review cases, zero `migration_review` periods, one Blocked member, and all four automation switches OFF.

The existing schema already includes `telegram_accounts` and `telegram_group_access`. Both tables are RLS-enabled and accessed only through the existing server-side service-role boundary. Production currently has 67 Telegram account/reference rows: 62 username-only stubs and 5 raw-only legacy references. No member has more than one Telegram account row, there are zero verified numeric Telegram IDs, and `telegram_group_access` has zero rows.

Phase 3A must preserve that clean reconciliation baseline and must not populate or mutate `telegram_group_access`.

## Scope

Phase 3A supports only verified identity linking for ACTIVE or LIFETIME members who are not Blocked.

An ACTIVE/LIFETIME member with `access_restoration_required=true` may still verify Telegram identity because verification itself does not grant access.

FORMER members are not eligible to receive or consume a Phase 3A link. They must first return through the normal deliberate Reactivation workflow.

Blocked members are never eligible. When a member is Blocked, every pending Phase 3A token for that member is revoked in the same safeguarding transaction. Unblocking never reactivates a revoked token; a fresh link requires a new deliberate admin issuance.

Phase 3A uses a dedicated CryptoMainly Membership bot, separate from G-Bot, trading alerts, public-community functions, and other Telegram automation.

The bot's Phase 3A responsibilities are intentionally narrow:
- receive a private-chat `/start <token>` interaction
- provide Telegram's genuine numeric user ID and current username to the server
- receive a safe success or failure response
- perform no group-access action

## Non-goals

Phase 3A does not implement group invitations, removals, bans, unbans, expiry enforcement, reminders, campaigns, payment automation, or marketing automation.

It does not implement the future Manual Access Exception itself. It reserves that requirement for the later Telegram access-automation phase.

## Core principles

1. Verified Telegram identity and Telegram group access are separate facts.
2. A successful Phase 3A link never implies VIP access was granted.
3. One CryptoMainly member may have at most one verified numeric Telegram identity in Phase 3A.
4. One verified numeric Telegram user ID may belong to only one canonical member.
5. Existing verified identity is never silently replaced, transferred, or overwritten.
6. Telegram usernames may change or disappear and do not control verified identity ownership.
7. Safeguarding remains authoritative: Blocked always prohibits linking and future access grants.
8. Protected strong identifiers remain durable and collision-safe.
9. Raw linking credentials are never stored after issuance.
10. Every successful verified link is atomic, attributable, auditable, and retry-safe.
11. No current automation switch is enabled by this release.
12. Future Telegram access automation must remain subordinate to an explicit audited Manual Access Exception, except that Blocked safeguarding and verified-identity conflicts are non-overridable by that exception.

## Chosen architecture

Use an admin-generated, single-use Telegram deep link backed by an opaque random token.

The Vercel-hosted CryptoMainly portal owns the webhook and admin endpoints. Supabase remains the authoritative transactional data store.

The dedicated Membership bot sends Telegram updates to the fixed HTTPS route `/api/telegram/webhook` in the existing portal.

The Telegram bot token, webhook secret, and Supabase service-role key remain server-side Vercel environment variables and are never exposed to browser code.

## Linking-token model

Create a dedicated `telegram_link_tokens` table rather than storing link state in `telegram_accounts`.

Each token record contains:
- `id` — token record UUID
- `member_id` — intended canonical member UUID
- `token_hash` — unique SHA-256 digest only
- `issued_at` and `issued_by`
- `expires_at`
- nullable `revoked_at`, `revoked_by`, and `revocation_reason`
- nullable `consumed_at`
- nullable unique `consumed_update_id` for Telegram retry idempotency
- `created_at`

The raw token uses 32 cryptographically random bytes encoded as unpadded base64url (43 characters, within Telegram's 64-character start-parameter limit). Supabase stores only its SHA-256 digest. The raw token is returned only in the immediate admin response used to construct the Telegram deep link.

The raw token is not stored in Supabase, audit rows, application logs, persisted URLs, analytics, or error messages.

The raw link is a bearer credential until consumed or expired. The admin UI must mark it as sensitive, instruct the administrator to send it only to the intended member, and make replacement/revocation the remedy if disclosure is suspected. Any HTTP response that contains the raw link must be non-cacheable.

Tokens expire 24 hours after issuance and are single-use.

Generating a replacement revokes every previous unused token for that member in the same authoritative operation.

Database constraints must make the token hash unique and permit at most one unconsumed, unrevoked token row per member. Replacement therefore revokes the prior live row before inserting the new one.

After a page refresh, the system does not reconstruct the prior raw link from the database. The administrator generates a replacement instead.

Token lookup compares the SHA-256 digest rather than plaintext. Because the token has 256 bits of random entropy, no additional recoverable token secret is required in the database.

## Admin link-generation flow

On an eligible member record, the administrator can select `Generate Telegram Link`.

Before issuance, the authenticated admin server action re-reads the authoritative member policy. Generation is rejected when the member is Blocked, FORMER, otherwise lacks an ACTIVE/LIFETIME entitlement, or already has a verified numeric Telegram ID.

A pending access-restoration requirement does not prevent generation because Phase 3A cannot grant group access.

Successful generation atomically revokes earlier unused tokens for the same member, creates the new hash-only token record, and writes an audit entry describing issuance without storing the raw token.

The UI receives the raw token once and constructs the Membership-bot deep link for `Copy Link` / `Open Bot` presentation.

The member-detail UI uses explicit linking states:
- `Not linked` — no verified numeric Telegram user ID
- `Link pending` — an unused, unexpired token exists
- `Verified` — one numeric Telegram identity is linked
- `Unavailable` — linking is prohibited, with an admin-facing reason

The UI must distinguish `Telegram identity: VERIFIED` from `VIP group access: Not managed by Phase 3A`.

The numeric Telegram user ID remains read-only in the admin interface. Current Telegram username remains factual/editable reference data under the existing audited correction rules.

## Telegram webhook flow

Telegram delivers private bot updates to the Vercel webhook over HTTPS.

The webhook accepts POST only and validates Telegram's configured webhook secret header before trusting or processing the update.

Webhook registration for Phase 3A requests only Telegram message updates and configures a secret_token; the route validates X-Telegram-Bot-Api-Secret-Token before privileged processing.

Phase 3A processes only the private-chat `/start <token>` flow required for linking. Unrelated updates are acknowledged safely without triggering membership actions.

For a valid start attempt, the server extracts:
- Telegram update ID
- private chat/user numeric Telegram ID
- current Telegram username when present
- supplied start token

The raw token is immediately transformed for lookup and must not be written to ordinary logs.

The server delegates the authoritative consume-and-link decision to one narrow server/database transaction boundary rather than performing a sequence of independent writes.

The bot-facing success response is intentionally minimal: `Your Telegram account has been successfully verified and linked to CryptoMainly.`

Expected failures return a generic message such as `This verification link is no longer valid. Please request a new link from CryptoMainly.`

Bot responses never reveal another member's identity, safeguarding state, internal entitlement details, collision ownership, protected-identifier history, or database error text.

## Authoritative consume-and-link transaction

Token consumption must recheck all current facts. The system never trusts eligibility merely because a link was valid when issued.

To serialize correctly with Block/Unblock and existing membership mutations, issuance and consume/link RPCs lock the member's safeguarding-state row first, following the established state-first lock order before Telegram identity rows are mutated. The relationship policy is evaluated from authoritative state inside that transaction.

The transaction must reject safely when:
- token hash is unknown, expired, revoked, or already consumed
- intended member no longer has ACTIVE/LIFETIME entitlement
- intended member is currently Blocked
- the supplied Telegram numeric ID is already owned by another member
- the intended member already has a different verified numeric Telegram ID
- the Telegram numeric ID collides with protected identity belonging to another canonical member
- Telegram's current normalized username, when present, is currently assigned or protected for another canonical member
- required safeguarding state is missing or contradictory
- an expected state/version check is stale

If the intended member has an existing unverified `telegram_accounts` reference row—username-only or raw-only—the transaction upgrades that logical account in place where safe rather than creating a competing verified account.

If no stub exists, exactly one verified account row may be created for the member.

The transaction stores the verified numeric Telegram user ID, Telegram's current username or NULL, and verification/link timestamps. It preserves `telegram_raw` as legacy/source reference rather than repurposing it. It sets `dm_available=true` because the member initiated the private bot conversation.

In Phase 3A, `dm_available=true` means the bot was reachable at successful verification time; it is not a permanent delivery guarantee and is not evidence of VIP group membership.

`linked_at` represents the first successful verified link. `bot_started_at` records the first successful Membership-bot interaction. `last_verified_at` records the current successful verification time.

The token is consumed in the same transaction as the verified identity write and audit history so no partial link can exist.

## Username semantics

The numeric Telegram user ID is authoritative after verification. Username mismatch never overrides verified numeric identity.

When Telegram reports a current username different from the stored unverified/reference username, a successful verified link updates the current username to Telegram's value and preserves before/after values in audit/history.

When Telegram reports no username, linking still succeeds. Current username becomes NULL rather than preserving a stale username as if it were current.

For members with Block history, old and new Telegram usernames remain protected strong identifiers according to the existing safeguarding rules.

A Telegram username alone never authorizes linking, transfer, replacement, access grant, or automatic member matching.

## Verified-identity ownership rules

Phase 3A permits at most one verified numeric Telegram identity per member.

The database must enforce this independently of UI logic with a uniqueness rule on member ownership for rows where 	elegram_user_id is non-NULL. The existing global uniqueness of 	elegram_user_id continues to enforce one canonical owner for each verified Telegram ID.

A Telegram numeric ID already linked to another member is an absolute hard stop. The system must not move or reassign it automatically, even with a valid link token.

If the intended member already has a different verified numeric Telegram ID, a new linking attempt is also a hard stop.

A future legitimate Telegram-account change requires a separate deliberate audited identity-correction workflow. Phase 3A does not implement that replacement workflow.

No member-facing Telegram message should identify the conflicting member record. The authenticated admin system may provide enough detail to investigate deliberately.

## Safeguarding and protected identity

Phase 3A consumes the existing shared safeguarding policy rather than creating a second Blocked concept.

Blocked is non-overridable in the linking flow. Neither token issuance nor token consumption may succeed for a currently Blocked member.

A verified numeric Telegram ID is a strong identifier.

If the member has ever been Blocked, successful verification must add the numeric Telegram user ID to `member_protected_identifiers` with the existing `telegram_verified` capture source, preserving permanent identity continuity.

Protected-identifier ownership is checked before the verified link is committed. A cross-member collision hard-fails the complete transaction.

Successful verification does not clear `access_restoration_required`, restore membership access, complete safeguarding tasks, or modify Block/Unblock history.

Phase 3A does not infer Telegram group presence from a successful bot link. `dm_available=true` proves a private bot conversation is available; it is not proof of VIP group membership.

## Audit semantics

General audit actions are explicit: `TELEGRAM_LINK_TOKEN_ISSUED`, `TELEGRAM_LINK_TOKEN_REVOKED`, `TELEGRAM_IDENTITY_LINKED`, and `TELEGRAM_LINK_REJECTED`. A rejection audit is written only for an authenticated Telegram webhook carrying a valid known token that reaches a business-rule conflict; unknown tokens, invalid webhook secrets, and malformed unsolicited updates must not be allowed to spam the membership audit trail.

A successful link audit records at least the canonical member, verified numeric Telegram ID, previous/current username, token-record reference, Telegram update reference, source/actor identity, and timestamps.

Replacement issuance writes the old-token revocation and new-token issuance audit entries in the same transaction. Blocking-related token revocation is included in the Block transaction/audit metadata without changing the existing meaning of the Block event.

The audit trail must never imply that VIP group access was granted.

Existing append-only safeguarding and general audit semantics remain authoritative. No historical event or protected identifier is rewritten or deleted by Phase 3A.

## Idempotency and Telegram retries

Telegram webhook delivery may be retried. Phase 3A must therefore treat duplicate delivery as an expected condition rather than a second linking instruction.

The implementation must use the Telegram update ID and authoritative token/account state so the same update cannot create duplicate Telegram accounts, duplicate token consumption, or duplicate success audit records.

If a database link transaction has committed but delivery of the bot confirmation fails, the committed database identity remains authoritative. Retrying the update must not roll back or reproduce the link.

Malformed or irrelevant Telegram updates are safely acknowledged without membership mutation.

The webhook should return successful HTTP responses after deterministic handling of expected duplicate/invalid updates so Telegram retries do not create a mutation loop.

## Security boundary

The browser never receives the Telegram bot token, webhook secret, Supabase service-role key, or stored token hashes.

The webhook rejects a missing or invalid Telegram secret before invoking privileged membership operations.

Database mutations are exposed through narrow server-side/RPC boundaries with explicit input validation, fixed safe `search_path` where `SECURITY DEFINER` is required, and denied direct execution for public client roles.

RLS remains enabled on all membership/Telegram/linking tables. Existing service-role-only architecture is preserved.

Sensitive identifiers and tokens must not be emitted into ordinary request logging. Unexpected failures return safe application/bot errors rather than raw database details.

## Future Manual Access Exception requirement

The user must remain able to make deliberate access decisions in legitimate unusual circumstances. Future Telegram access automation must therefore include an explicit Manual Access Exception capability.

That later capability must be separate from Phase 3A verified identity and must record at least:
- approving administrator
- mandatory reason
- start timestamp
- optional expiry or explicit no-expiry decision
- later cancellation/expiry outcome
- immutable audit history

A valid Manual Access Exception must take precedence over routine future invite/removal eligibility automation so automation cannot silently undo a deliberate admin exception.

Two categories remain non-overridable through this exception mechanism:
- current Blocked safeguarding state
- verified/protected identity ownership conflicts

A Blocked member must first pass through the dedicated Unblock workflow. A conflicting verified Telegram identity must first pass through a separate audited identity-correction workflow.

Phase 3A records this as an architectural constraint only. It does not create access-exception tables, controls, or group mutations.

## Group-access isolation

Phase 3A must not insert, update, or delete rows in `telegram_group_access`.

It must not call Telegram methods that create invite links, approve join requests, ban/remove users, unban users, inspect access for automatic action, or otherwise change group membership.

The four existing automation settings remain OFF: automatic reminders, automatic removals, campaign sending, and payment auto-activation.

## Error handling

Expected failures must use safe, specific admin-facing error codes and generic member-facing bot text.

Expected conditions include:
- invalid, expired, revoked, or consumed token
- member no longer eligible
- member currently Blocked
- Telegram ID owned by another member
- intended member already has a different verified ID
- protected-identifier collision
- stale state/version
- malformed Telegram update
- invalid webhook authentication

Any database failure during consume-and-link must roll back token consumption, Telegram account changes, protected-identifier capture, and audit writes together.

No failure path may create a partially verified account or alter Telegram group access.

## Testing requirements

Implementation must use TDD for token/domain/linking behaviour before product code.

Database tests must cover issuance, 24-hour expiry, replacement revocation, single consumption, rollback, ACTIVE/LIFETIME eligibility, FORMER rejection, Blocked rejection, pending-restoration allowance, ownership conflicts, protected-identifier conflicts, and username/no-username cases.

They must also prove one verified identity per member and one owner per numeric Telegram ID.

Webhook/application tests must cover valid/invalid webhook secret handling, private `/start` parsing, malformed updates, duplicate Telegram update delivery, safe retry behaviour, token secrecy, generic bot errors, and successful bot confirmation.

Admin/UI tests must cover `Not linked`, `Link pending`, `Verified`, and `Unavailable`; link generation; replacement; 24-hour expiry display; one-time raw-link presentation; read-only numeric ID; and the explicit separation from VIP group access.

Regression tests must keep Add Member, Universal Editing, Review, Phase 2 membership actions, and safeguarding suites passing.

A Phase 3A-specific invariant test must prove no implementation path writes `telegram_group_access` or enables any automation switch.

TypeScript checking, production build, diff checks, and focused UI/webhook smoke tests are required before Preview approval.

## Rollout sequence

1. Implement in the isolated Phase 3A feature worktree/branch.
2. Create/apply the database migration in the intended environment only after review.
3. Verify new schema/RPC privileges, RLS boundaries, indexes, and unchanged business data.
4. Exercise rollback-safe synthetic token/linking cases and remove synthetic records.
5. Deploy a Vercel Preview with the dedicated Membership bot webhook pointed only at the approved test/Preview endpoint where feasible.
6. Perform one controlled end-to-end link using a test Telegram account.
7. Verify token consumption, verified identity, username semantics, DM flag, audit history, and idempotent retry behaviour.
8. Confirm zero `telegram_group_access` writes and all four automation switches remain OFF.
9. Re-run database, Node, TypeScript, build, smoke, and diff verification.
10. Present the Preview and verification evidence for explicit approval before merge/push to `main`.

11. After explicit Production approval, merge and deploy through the existing controlled Vercel path.
12. Prefer the first permanent Production link to be a genuine eligible ACTIVE/LIFETIME member rather than synthetic business data.

Production verification must preserve the reconciled membership baseline except for legitimate business changes made independently while development proceeds.

## Acceptance criteria

Phase 3A is complete when:
- an eligible ACTIVE/LIFETIME member can be issued a 24-hour single-use deep link
- only a hash of the linking token is stored
- a valid private bot start binds Telegram's genuine numeric user ID atomically to the intended member
- one member has at most one verified numeric Telegram identity
- one Telegram numeric ID cannot belong to multiple members
- existing different verified identity and cross-member ownership conflicts hard-fail
- current username is refreshed from Telegram, including becoming NULL when no username exists
- Blocked and FORMER members cannot generate or consume links
- pending access restoration does not prevent identity-only verification
- successful linking is idempotent under webhook retries and fully audited
- protected identity is extended correctly for members with Block history
- raw tokens/secrets are absent from persistent storage and ordinary logs
- no Phase 3A path changes Telegram group access or enables automation
- the admin UI clearly distinguishes verified identity from VIP group access
- future Manual Access Exception requirements remain preserved for the later access-automation design
- Production merge/deployment remains gated on explicit Preview approval

## Implementation boundary

Approval of this specification authorizes creation of a detailed implementation plan only. It does not itself authorize database migration, Telegram BotFather configuration, webhook activation, Vercel secret changes, merge to `main`, or Production deployment.
