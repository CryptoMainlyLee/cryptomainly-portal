import "server-only";
// Dedicated Next.js 16 acceptance QA. Never permit this branch to use
// Production editorial storage or the live VIP Telegram destination.
export const HOSTED_QA_WEB_BRANCH="feature/mi-v135-next16-writable-test-2026-11-26";
export const HOSTED_QA_STATE_BRANCH="v135-next16-test-20261126";
export function hostedQaIsolated():boolean{
 const e=process.env;
 return e.VERCEL==="1"&&e.VERCEL_ENV==="preview"&&e.VERCEL_GIT_COMMIT_REF===HOSTED_QA_WEB_BRANCH&&e.VERCEL_GIT_REPO_SLUG==="cryptomainly-portal"&&e.CM_QA_WRITABLE_SANDBOX==="true"&&e.MI_EDITORIAL_MODE==="preview"&&e.MI_EDITORIAL_QA_BRANCH===HOSTED_QA_STATE_BRANCH&&e.MI_MAKE_HOSTED_QA==="true";
}
export function hostedQaStorageBranch():string|null{
 if(process.env.MI_MAKE_HOSTED_QA!=="true")return null;
 if(!hostedQaIsolated())throw Error("Next16 hosted QA must use its exact private Preview branch and sandbox registry");
 return HOSTED_QA_STATE_BRANCH;
}
