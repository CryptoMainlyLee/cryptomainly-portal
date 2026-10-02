import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../app/admin/vip/[memberId]/", import.meta.url);
const page = readFileSync(new URL("page.tsx", root), "utf8");
const files = [
  "MemberDetailsEditor.tsx",
  "TelegramUsernameEditor.tsx",
  "MembershipPeriodEditor.tsx",
  "PaymentEditor.tsx",
];

for (const file of files) {
  const source = readFileSync(new URL(file, root), "utf8");
  assert.match(page, new RegExp(file.replace(".tsx", "")));
  assert.match(source, /Review changes|Review change|Preview changes|Preview/);
  assert.match(source, /Confirm|Save correction|Confirm & save/);
}

const telegram = readFileSync(new URL("TelegramUsernameEditor.tsx", root), "utf8");
const period = readFileSync(new URL("MembershipPeriodEditor.tsx", root), "utf8");
const payment = readFileSync(new URL("PaymentEditor.tsx", root), "utf8");

assert.match(telegram, /telegram_user_id · read only/);
assert.match(telegram, /telegram_raw · preserved/);
assert.doesNotMatch(telegram, /name=["']telegram_user_id["']/);
assert.doesNotMatch(telegram, /name=["']linked_at["']/);
assert.match(period, /source \/ legacy evidence — read only/);
assert.match(period, /migration_review/);
assert.doesNotMatch(period, /name=["']source["']/);
assert.doesNotMatch(period, /name=["']legacy_notes["']/);
assert.match(payment, /payment_id · read only/);
assert.match(payment, /verification_method · read only/);
assert.match(payment, /Europe\/London/);
assert.match(payment, /datetime-local/);
assert.doesNotMatch(payment, /name=["']verified_by["']/);
assert.doesNotMatch(page, /updateMembershipNoteAction/);
assert.match(page, /getMemberPayments/);
assert.match(page, /getMemberTelegramAccounts/);
assert.match(page, /getMemberReviewCases/);
console.log("PASS universal member editing UI wiring is present");

const reviewPanel = readFileSync(new URL("ReviewCasesPanel.tsx", root), "utf8");
assert.match(page, /ReviewCasesPanel/);
assert.match(reviewPanel, /CORRECTED_DATA_UPDATED/);
assert.match(reviewPanel, /EXISTING_DATA_CONFIRMED/);
assert.match(reviewPanel, /HISTORICAL_DETAIL_UNKNOWN_ACCEPTED/);
assert.match(reviewPanel, /Reviewed — historical detail unknown\/accepted/);
assert.match(reviewPanel, /Mark In Review/);
assert.match(reviewPanel, /detectReviewConcerns/);
