"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
const gate=require("./verify-mi-next16-writable-qa.cjs");
const BRANCH=gate.BRANCH,STATE=gate.STATE,CANDIDATE=gate.CANDIDATE;
const compiled=ts.transpileModule(fs.readFileSync("proxy.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const isolated={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:BRANCH,VERCEL_GIT_REPO_SLUG:"cryptomainly-portal",CM_QA_WRITABLE_SANDBOX:"true",MI_EDITORIAL_MODE:"preview",MI_EDITORIAL_QA_BRANCH:STATE,MI_MAKE_HOSTED_QA:"true",MI_MAKE_DESTINATION:"TEST_ONLY",GOOGLE_SCRIPT_URL:"DISABLED",SUPABASE_URL:"https://qa-disabled.invalid",NEXT_PUBLIC_CHART_PIN:"QA_DISABLED",CM_QA_TEST_CANDIDATE_ID:CANDIDATE,CM_ADMIN_PASSWORD:"QA16_"+"S".repeat(96),MI_EDITORIAL_GITHUB_TOKEN:"SYNTHETIC_REPO_SCOPED_GITHUB_TOKEN_TEST_ONLY",MI_MAKE_TEST_ENABLED:"false",MI_MAKE_WEBHOOK_URL:"DISABLED",CM_QA_SEND_WINDOW:"CLOSED"};
const armed={...isolated,MI_MAKE_TEST_ENABLED:"true",CM_QA_SEND_WINDOW:"ARMED_ONE_MESSAGE",MI_MAKE_WEBHOOK_URL:"https://hook.eu2.make.com/"+"a".repeat(28),MI_MAKE_WEBHOOK_API_KEY:"A".repeat(36)};
let n=0;function check(x,msg){assert(x,msg);n++;}
function invoke(env,method,path){
 const o={};
 function MockResponse(msg,{status,headers}){return {body:msg,status,headers,kind:"blocked"}}
 MockResponse.next=()=>({status:200,kind:"next",headers:new Map()});
 vm.runInNewContext(compiled,{exports:o,require:name=>name==="next/server"?{NextResponse:MockResponse}:assert.fail("Unexpected import "+name),process:{env}}, {filename:"proxy.ts"});
 return o.proxy({method,nextUrl:{pathname:path,hostname:"127.0.0.1"}});
}
for(const e of [isolated,armed])check(gate.verify(e).ok===true,"Valid closed/armed environment");
for(const env of [isolated,armed]){
 check(gate.verify({...env,CM_ADMIN_PASSWORD:"Ab9!"+ "x".repeat(20)}).ok===true,"24-character QA password without forced prefix accepted");
 for(const length of [23,257])check((()=>{try{gate.verify({...env,CM_ADMIN_PASSWORD:"x".repeat(length)});return false}catch{return true}})(),"Password outside QA length bounds rejected");
}
check(invoke({NODE_ENV:"production"},"POST","/admin/market-intelligence/session").status===200,"Offline synthetic local E2E can run without Vercel");
check(invoke({NODE_ENV:"development"},"POST","/admin/market-intelligence/session").status===503,"Development mode cannot bypass writable QA");
for(const broken of [{MI_EDITORIAL_QA_BRANCH:"main"},{MI_EDITORIAL_MODE:"production"},{SUPABASE_URL:"https://live.invalid"},{GOOGLE_SCRIPT_URL:"https://script.google.com"},{VERCEL_ENV:"production"},{MI_MAKE_DESTINATION:"LIVE"},{CM_ADMIN_PASSWORD:"bad"},{MI_EDITORIAL_GITHUB_TOKEN:""},{SUPABASE_SERVICE_ROLE_KEY:"secret"},{CM_QA_TEST_CANDIDATE_ID:"different"},{CM_QA_WRITABLE_SANDBOX:"false"}])check((()=>{try{gate.verify({...isolated,...broken});return false}catch{return true}})(),"Gate rejects incorrect setting");
for(const broken of [{MI_MAKE_TEST_ENABLED:"true"},{MI_MAKE_WEBHOOK_API_KEY:"x"},{CM_QA_SEND_WINDOW:"ARMED_ONE_MESSAGE"},{MI_MAKE_WEBHOOK_URL:"https://hook.eu2.make.com/"+ "a".repeat(28)}])check((()=>{try{gate.verify({...isolated,...broken});return false}catch{return true}})(),"Closed gate rejects risky setting");
for(const broken of [{CM_QA_SEND_WINDOW:"CLOSED"},{MI_MAKE_WEBHOOK_API_KEY:""},{MI_MAKE_WEBHOOK_URL:"DISABLED"},{MI_MAKE_DESTINATION:"VIP"}])check((()=>{try{gate.verify({...armed,...broken});return false}catch{return true}})(),"Armed gate rejects dangerous setting");
for(const path of ["/","/admin/vip","/admin/market-intelligence/queue"]){const r=invoke(isolated,"GET",path);check(r.status===200,"Isolated GET allowed");check(r.headers.get("X-Robots-Tag")==="noindex, nofollow, noarchive","Noindex set");}
for(const path of ["/admin/market-intelligence/session","/admin/market-intelligence/queue/action"])check(invoke(isolated,"POST",path).status===200,"Allow only intended editorial write");
for(const path of ["/admin/vip/login","/admin/vip/new","/api/subscribe","/api/contact","/admin/market-intelligence/action","/admin/market-intelligence/queue/import","/admin/market-intelligence/queue/send","/"]){check(invoke(isolated,"POST",path).status===403,"All other writes blocked")}
check(invoke(armed,"POST","/admin/market-intelligence/queue/send").status===200,"Single send arm allows designated send route");
for(const method of ["PUT","PATCH","DELETE","OPTIONS"])check(invoke(armed,method,"/admin/market-intelligence/queue/send").status===403,"Non-POST send methods rejected");
for(const wrong of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},{CM_QA_WRITABLE_SANDBOX:"false"},{MI_EDITORIAL_QA_BRANCH:"main"}])check(invoke({...isolated,...wrong},"GET","/").status===503,"Fail closed on wrong runtime");
const hostSrc=fs.readFileSync("app/_mi/hosted-qa.ts","utf8");
const hostCompiled=ts.transpileModule(hostSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function host(env){const o={};vm.runInNewContext(hostCompiled,{exports:o,process:{env},require:name=>name==="server-only"?{}:assert.fail(name)});return o}
check(host(isolated).hostedQaIsolated()===true,"Hosted registry exact Preview scope");
check(host(isolated).hostedQaStorageBranch()===STATE,"Hosted source writes pinned to new sandbox branch");
check(host({...isolated,VERCEL_GIT_COMMIT_REF:"main"}).hostedQaIsolated()===false,"Hosted wrong branch rejected");
const send=fs.readFileSync("app/admin/market-intelligence/queue/send/route.ts","utf8");
const edit=fs.readFileSync("app/admin/market-intelligence/queue/action/route.ts","utf8");
check(send.includes('data.get("id")!==process.env.CM_QA_TEST_CANDIDATE_ID'),"Send route pinned to one preexisting unsent candidate");
check(edit.includes('data.get("action")!=="edit"'),"Editor route only permits draft edits");
check(edit.includes('data.get("id")!==process.env.CM_QA_TEST_CANDIDATE_ID'),"Editor route pinned to same candidate");
console.log("NEXT16_WRITABLE_QA_GUARDS_PASSED",n,"NO_NETWORK_NO_REAL_SEND");
