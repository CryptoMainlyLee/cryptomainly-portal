import "server-only";

// Host-only, branch-pinned TEST environment; never enable on public Production.
export const HOSTED_QA_WEB_BRANCH="feature/mi-web-one-click-test-2026-11-21";
export const HOSTED_QA_STATE_BRANCH="v135-hosted-web-e2e-20261121";
export function hostedQaIsolated():boolean{
 const env=process.env;
 return env.MI_MAKE_HOSTED_QA==="true"&&env.VERCEL==="1"&&env.VERCEL_ENV==="preview"&&env.MI_EDITORIAL_MODE==="preview"&&env.VERCEL_GIT_COMMIT_REF===HOSTED_QA_WEB_BRANCH&&env.VERCEL_GIT_REPO_SLUG==="cryptomainly-portal"&&env.MI_EDITORIAL_QA_BRANCH===HOSTED_QA_STATE_BRANCH;
}
export function hostedQaStorageBranch():string|null{
 if(process.env.MI_MAKE_HOSTED_QA!=="true")return null;
 if(!hostedQaIsolated())throw Error("Hosted Make QA must use its pinned Vercel Preview and private sandbox branch");
 return HOSTED_QA_STATE_BRANCH;
}
