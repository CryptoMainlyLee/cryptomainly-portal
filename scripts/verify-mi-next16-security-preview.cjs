"use strict";
// V1.35+Next16 cloud-only safety gate. Production and other Vercel
// deployments must never consume this standalone QA branch.
const env=process.env;
const BRANCH="security/mi-v135-next16-integration-2026-11-25";
const QA_SECRET_PREFIX="QA_ONLY_";
const checks=[
 ["VERCEL_ENV", "preview"],
 ["VERCEL_GIT_COMMIT_REF", BRANCH],
 ["VERCEL_GIT_REPO_SLUG", "cryptomainly-portal"],
 ["CM_SECURITY_QA_READ_ONLY", "true"],
 ["MI_EDITORIAL_MODE", "off"],
 ["MI_MAKE_TEST_ENABLED", "false"],
 ["MI_MAKE_HOSTED_QA", "false"],
 ["MI_MAKE_DESTINATION", "DISABLED"],
 ["MI_MAKE_WEBHOOK_URL", "DISABLED"],
 ["GOOGLE_SCRIPT_URL", "DISABLED"],
 ["SUPABASE_URL", "https://qa-disabled.invalid"],
 ["NEXT_PUBLIC_CHART_PIN", "QA_DISABLED"],
];
function verify(e){
 const cloud=e.VERCEL==="1"||e.VERCEL_ENV==="production"||e.VERCEL_ENV==="preview";
 if(!cloud)return {cloud:false,ok:true};
 const failures=checks.filter(([name,expected])=>e[name]!==expected).map(([name])=>name);
 if(typeof e.CM_ADMIN_PASSWORD!=="string"||!e.CM_ADMIN_PASSWORD.startsWith(QA_SECRET_PREFIX)||e.CM_ADMIN_PASSWORD.length<64) failures.push("CM_ADMIN_PASSWORD");
 if(e.SUPABASE_SERVICE_ROLE_KEY)failures.push("SUPABASE_SERVICE_ROLE_KEY");
 if(e.MI_MAKE_WEBHOOK_API_KEY)failures.push("MI_MAKE_WEBHOOK_API_KEY");
 if(e.MI_EDITORIAL_GITHUB_TOKEN)failures.push("MI_EDITORIAL_GITHUB_TOKEN");
 if(failures.length)throw Error("Security QA build refused; invalid environment names: "+failures.join(", "));
 return {cloud:true,ok:true};
}
if(require.main===module){const result=verify(env);console.log("SECURITY_QA_PREFLIGHT_PASSED",{cloud:result.cloud,isolated:result.ok,noSecretsPrinted:true});}
module.exports={verify,BRANCH};
