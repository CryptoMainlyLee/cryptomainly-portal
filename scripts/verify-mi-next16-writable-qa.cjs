"use strict";
const BRANCH="feature/mi-v135-next16-writable-test-2026-11-26";
const STATE="v135-next16-test-20261126";
const CANDIDATE="0200d4cc-6aa7-4b3f-abb5-a1ba52195667";
function verify(e){
 const cloud=e.VERCEL==="1"||["production","preview"].includes(e.VERCEL_ENV);
 if(!cloud)return {cloud:false,ok:true,sendArmed:false};
 const checks=[
 ["VERCEL","1"],["VERCEL_ENV","preview"],["VERCEL_GIT_COMMIT_REF",BRANCH],["VERCEL_GIT_REPO_SLUG","cryptomainly-portal"],
 ["CM_QA_WRITABLE_SANDBOX","true"],["MI_EDITORIAL_MODE","preview"],["MI_MAKE_HOSTED_QA","true"],["MI_EDITORIAL_QA_BRANCH",STATE],
 ["MI_MAKE_DESTINATION","TEST_ONLY"],["GOOGLE_SCRIPT_URL","DISABLED"],["SUPABASE_URL","https://qa-disabled.invalid"],["NEXT_PUBLIC_CHART_PIN","QA_DISABLED"],
 ["CM_QA_TEST_CANDIDATE_ID",CANDIDATE]
 ];
 const failures=checks.filter(([k,v])=>e[k]!==v).map(([k])=>k);
 if(typeof e.CM_ADMIN_PASSWORD!=="string"||!e.CM_ADMIN_PASSWORD.startsWith("QA16_")||e.CM_ADMIN_PASSWORD.length<64)failures.push("CM_ADMIN_PASSWORD");
 if(!e.MI_EDITORIAL_GITHUB_TOKEN||e.MI_EDITORIAL_GITHUB_TOKEN.length<30)failures.push("MI_EDITORIAL_GITHUB_TOKEN");
 if(e.SUPABASE_SERVICE_ROLE_KEY)failures.push("SUPABASE_SERVICE_ROLE_KEY");
 const sendArmed=e.MI_MAKE_TEST_ENABLED==="true";
 if(!sendArmed){
  for(const [k,v] of [["MI_MAKE_TEST_ENABLED","false"],["CM_QA_SEND_WINDOW","CLOSED"],["MI_MAKE_WEBHOOK_URL","DISABLED"]])
   if(e[k]!==v)failures.push(k);
  if(e.MI_MAKE_WEBHOOK_API_KEY)failures.push("MI_MAKE_WEBHOOK_API_KEY");
 }else{
  if(e.CM_QA_SEND_WINDOW!=="ARMED_ONE_MESSAGE")failures.push("CM_QA_SEND_WINDOW");
  if(!e.MI_MAKE_WEBHOOK_API_KEY||! /^[A-Za-z0-9_-]{20,256}$/.test(e.MI_MAKE_WEBHOOK_API_KEY))failures.push("MI_MAKE_WEBHOOK_API_KEY");
  try{const u=new URL(e.MI_MAKE_WEBHOOK_URL);if(u.protocol!=="https:"||u.hostname!=="hook.eu2.make.com"||u.search||u.hash||!/^\/[A-Za-z0-9_-]{20,128}$/.test(u.pathname))failures.push("MI_MAKE_WEBHOOK_URL")}catch{failures.push("MI_MAKE_WEBHOOK_URL")}
 }
 if(failures.length)throw Error("Isolated Next16 writable-QA build blocked; bad config keys: "+[...new Set(failures)].join(", "));
 return {cloud:true,ok:true,sendArmed};
}
if(require.main===module){const result=verify(process.env);console.log("NEXT16_WRITABLE_SANDBOX_PREFLIGHT_PASS",{cloud:result.cloud,isolated:true,sendArmed:result.sendArmed,noSecretsPrinted:true});}
module.exports={verify,BRANCH,STATE,CANDIDATE};
