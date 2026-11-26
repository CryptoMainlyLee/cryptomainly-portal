"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
const source=fs.readFileSync("proxy.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const BRANCH="security/mi-v135-next16-integration-2026-11-25";
let checks=0;
function run(env,method,path="/admin/market-intelligence/queue/send"){
 const exports={};
 const NextResponse={
  next:()=>({status:200,headers:new Map(),kind:"next"}),
 };
 function Response(text,{status,headers}){return {body:text,status,headers,kind:"blocked"};}
 // Transpiled 'new NextResponse(...)' requires a constructor while 'next'
 // is a static method.
 Response.next=NextResponse.next;
 vm.runInNewContext(compiled,{exports,require:(name)=>name==="next/server"?{NextResponse:Response}:assert.fail("unexpected import"),process:{env}}, {filename:"proxy.ts"});
 return exports.proxy({method,nextUrl:{pathname:path}});
}
const good={VERCEL_GIT_COMMIT_REF:BRANCH,CM_SECURITY_QA_READ_ONLY:"true",VERCEL_ENV:"preview"};
for(const method of ["GET","HEAD"]){const r=run(good,method);assert.equal(r.status,200);checks++;}
for(const method of ["POST","PUT","PATCH","DELETE","OPTIONS"]){const r=run(good,method);assert.equal(r.status,403);checks++;}
for(const env of [{...good,VERCEL_ENV:"production"},{...good,CM_SECURITY_QA_READ_ONLY:"false"},{...good,VERCEL_GIT_COMMIT_REF:"main"}]){assert.equal(run(env,"GET").status,503);checks++;}
assert.equal(run({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"main"},"POST").status,200);checks++;
assert.equal(run({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/mi-web-one-click-test-2026-11-21"},"POST").status,200);checks++;
const gate=require("./verify-mi-next16-security-preview.cjs");
const full={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:BRANCH,VERCEL_GIT_REPO_SLUG:"cryptomainly-portal",CM_SECURITY_QA_READ_ONLY:"true",CM_ADMIN_PASSWORD:"QA_ONLY_"+"x".repeat(66),MI_EDITORIAL_MODE:"off",MI_MAKE_TEST_ENABLED:"false",MI_MAKE_HOSTED_QA:"false",MI_MAKE_DESTINATION:"DISABLED",MI_MAKE_WEBHOOK_URL:"DISABLED",GOOGLE_SCRIPT_URL:"DISABLED",SUPABASE_URL:"https://qa-disabled.invalid",NEXT_PUBLIC_CHART_PIN:"QA_DISABLED"};
assert.equal(gate.verify(full).ok,true);checks++;
for(const change of [{MI_MAKE_TEST_ENABLED:"true"},{MI_EDITORIAL_MODE:"preview"},{SUPABASE_URL:"https://live.example"},{GOOGLE_SCRIPT_URL:"https://script.google.com/"},{CM_ADMIN_PASSWORD:"a"},{MI_MAKE_WEBHOOK_API_KEY:"present"},{MI_EDITORIAL_GITHUB_TOKEN:"present"},{SUPABASE_SERVICE_ROLE_KEY:"present"},{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"}]){
 assert.throws(()=>gate.verify({...full,...change}));checks++;
}
assert.equal(gate.verify({VERCEL_ENV:undefined}).ok,true);checks++;
console.log("SECURITY_NEXT16_PREVIEW_READ_ONLY_GUARDS_PASS",checks);
