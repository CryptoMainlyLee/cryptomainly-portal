import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../app/admin/vip/[memberId]/", import.meta.url);
const page = readFileSync(new URL("page.tsx", root), "utf8");
const panel = readFileSync(new URL("SafeguardingPanel.tsx", root), "utf8");
const actions = readFileSync(new URL("MembershipActions.tsx", root), "utf8");

assert.match(page, /SafeguardingPanel/);
assert.match(page, /getMemberSafeguardingEvents/);
assert.match(page, /getMemberSafeguardingTasks/);
assert.ok(page.indexOf("<SafeguardingPanel") < page.indexOf("<MembershipActions"));
assert.match(page, /isBlocked=\{member\.is_blocked\}/);
assert.match(page, /accessRestorationRequired=\{member\.effective_access_restoration_required\}/);

assert.match(panel, />BLOCKED</);
assert.match(panel, /No contact\. No membership\/group access\./);
assert.match(panel, /Previously blocked/);
assert.match(panel, /Latest unblock/);
assert.match(panel, /Safeguarding history/);
assert.match(panel, /ACCESS RESTORATION REQUIRED/);
assert.match(panel, /Safeguarding summary/);
assert.match(panel, /Full safeguarding reason/);
assert.match(panel, /I confirm this member must receive no further contact or membership\/group access/);
assert.match(panel, /I acknowledge that unblocking removes the restriction but does not restore membership or group access/);
assert.match(panel, /I confirm I deliberately want to restore access under the existing entitlement and original expiry\/lifetime terms/);
assert.match(panel, /Removed from Telegram/);
assert.match(panel, /Confirmed not present \/ no access to remove/);
assert.match(panel, /Completed by/);
assert.match(panel, /Completed at/);
assert.match(panel, /Outcome/);
assert.match(panel, /Completion note/);

assert.match(actions, /Unavailable while this member is Blocked\./);
assert.match(actions, /Restore access before changing this active entitlement\./);
assert.match(actions, /isBlocked: boolean/);
assert.match(actions, /accessRestorationRequired: boolean/);

console.log("PASS blocked member safeguarding UI wiring is present");
