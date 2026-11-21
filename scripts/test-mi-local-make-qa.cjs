"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const root=path.resolve(__dirname,"..");const file=path.join(root,"app/_mi/vip-outbox.ts"),raw=fs.readFileSync(file,"utf8"),js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function config(env){const output={};vm.runInNewContext(js,{exports:output,process:{env},require(n){if(n==="server-only")return {};if(n==="node:crypto")return require("node:crypto");if(n==="./review-queue")return {};throw Error("Unexpected import "+n);},URL,Date,console,structuredClone,AbortSignal,Response},{filename:file});return output.vipConfig();}
const stub="https://hook.eu2.make.com/"+"Q".repeat(40);
const base={MI_MAKE_TEST_ENABLED:"true",MI_MAKE_DESTINATION:"TEST_ONLY",MI_MAKE_WEBHOOK_URL:stub,MI_MAKE_WEBHOOK_API_KEY:"Z".repeat(48),MI_EDITORIAL_TEST_QUEUE_FILE:"C:/temp/isolated-qa.json",MI_EDITORIAL_TEST_FILE:"C:/temp/isolated-source.json",MI_EDITORIAL_MODE:"local",MI_MAKE_LOCAL_QA:"true",NODE_ENV:"production"};
const tests=[
 ["isolated local TEST-only enabled",base,true],
 ["explicit QA flag required",{...base,MI_MAKE_LOCAL_QA:"false"},false],
 ["reject Vercel flag",{...base,VERCEL:"1"},false],
 ["reject Vercel preview",{...base,VERCEL_ENV:"preview"},false],
 ["reject Vercel production impersonation",{...base,VERCEL_ENV:"production"},false],
 ["reject development server",{...base,NODE_ENV:"development"},false],
 ["reject no private queue",{...base,MI_EDITORIAL_TEST_QUEUE_FILE:""},false],
 ["reject no private sources",{...base,MI_EDITORIAL_TEST_FILE:""},false],
 ["reject production editorial mode masquerade",{...base,MI_EDITORIAL_MODE:"production"},false],
 ["reject real VIP destination",{...base,MI_MAKE_DESTINATION:"VIP"},false],
 ["reject wrong Make host",{...base,MI_MAKE_WEBHOOK_URL:"https://other.example/hook"},false],
 ["reject missing secret",{...base,MI_MAKE_WEBHOOK_API_KEY:""},false],
 ["production original enable unaffected",{...base,VERCEL_ENV:"production",MI_EDITORIAL_MODE:"production",MI_MAKE_LOCAL_QA:"false"},true],
 ["preview mode remains blocked",{...base,VERCEL_ENV:"preview",MI_EDITORIAL_MODE:"preview"},false],
];
for(const [label,env,enabled] of tests){assert.equal(config(env).enabled,enabled,label);console.log("PASS",label)}
console.log("LOCAL_MAKE_TEST_GUARD_PASS",tests.length);
