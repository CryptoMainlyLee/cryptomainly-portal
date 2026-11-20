"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"app/_mi/auth.ts"),"utf8");
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const env={VERCEL_ENV:"production",VERCEL_URL:"cryptomainly-portal-staged-qa.vercel.app",MI_EDITORIAL_MODE:"production"};
const targetExports={};
vm.runInNewContext(javascript,{exports:targetExports,process:{env},Buffer,URL,URLSearchParams,Request,console,require(name){if(name==="server-only")return {};if(name==="next/headers")return {cookies:()=>{throw Error("not needed")}};if(name==="node:crypto")return require("node:crypto");throw Error("Unexpected import "+name)}},{filename:"auth-transpiled.js"});
const req=url=>new Request(url);
let count=0;
function yes(value,label){assert.ok(value,label);console.log("PASS",label);count++}
function equal(a,b,label){assert.equal(a,b,label);console.log("PASS",label);count++}
function denied(fn,label){assert.throws(fn);console.log("PASS",label);count++}
(async()=>{
const stage="https://cryptomainly-portal-staged-qa.vercel.app";
equal(targetExports.trustedOrigin(req(stage+"/admin/market-intelligence/session")),stage,"staged-production exact deployment allowed");
equal(targetExports.trustedOrigin(req("https://www.cryptomainly.co.uk/admin/market-intelligence/session")),"https://www.cryptomainly.co.uk","production canonical domain allowed");
denied(()=>targetExports.trustedOrigin(req("https://attacker.vercel.app/admin/market-intelligence/session")),"unrelated vercel.app host refused");
denied(()=>targetExports.trustedOrigin(req("https://cryptomainly-portal-previous-qa.vercel.app/admin/market-intelligence/session")),"other deployment refused");
denied(()=>targetExports.trustedOrigin(req("https://evil.example/admin/market-intelligence/session")),"arbitrary host refused");
const make=(host,origin,extra={})=>new Request(host+"/admin/market-intelligence/session",{method:"POST",headers:{origin,"content-type":"application/x-www-form-urlencoded","content-length":"9",...extra},body:"key=wrong"});
equal((await targetExports.form(make(stage,stage))).get("key"),"wrong","staged-production form accepts same-origin request");
await assert.rejects(()=>targetExports.form(make(stage,"https://evil.example")));console.log("PASS cross-origin POST denied");count++;
await assert.rejects(()=>targetExports.form(make(stage,stage,{"sec-fetch-site":"cross-site"})));console.log("PASS cross-site fetch denied");count++;
env.VERCEL_ENV="preview";
equal(targetExports.trustedOrigin(req(stage+"/admin/market-intelligence/session")),stage,"Preview trusted deployment preserved");
await assert.rejects(()=>targetExports.form(make(stage,"https://evil.example")));console.log("PASS Preview cross-origin POST denied");count++;
env.VERCEL_URL="not-a-vercel-domain";
denied(()=>targetExports.trustedOrigin(req("https://www.cryptomainly.co.uk")),"preview invalid deployment env blocked");
env.VERCEL_ENV="production";
equal(targetExports.trustedOrigin(req("https://www.cryptomainly.co.uk")),"https://www.cryptomainly.co.uk","canonical host survives unavailable deployment env");
denied(()=>targetExports.trustedOrigin(req(stage)),"unverified production-stage host rejected");
console.log("ORIGIN_SECURITY_REGRESSION_PASS",count);
})().catch(e=>{console.error(e.stack);process.exitCode=2});
