"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const root=path.resolve(__dirname,".."),env={CM_ADMIN_PASSWORD:"Short-but-unique!27",MI_EDITORIAL_ACCESS_KEY:"Old-Long-Code-Will-Not-Work"};
const crypto=require("node:crypto");
function load(file){const source=fs.readFileSync(path.join(root,file),"utf8"),js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};const req=n=>{if(n==="server-only")return {};if(n==="next/headers")return {cookies:()=>{throw Error("Not needed for password comparison")}};if(n==="node:crypto"||n==="crypto")return crypto;throw Error("Unexpected module "+n)};vm.runInNewContext(js,{exports,require:req,process:{env},Buffer,URL,URLSearchParams,Request,console,setTimeout,clearTimeout,Date},{filename:file});return exports}
const mi=load("app/_mi/auth.ts"),vip=load("app/admin/vip/_lib/auth.ts");
let checks=0;function yes(x,label){assert.ok(x,label);console.log("PASS",label);checks++}
yes(mi.configured(),"Market Intelligence accepts shared short password");
yes(mi.matches(env.CM_ADMIN_PASSWORD),"Market Intelligence matches VIP shared password");
yes(vip.passwordMatches(env.CM_ADMIN_PASSWORD),"VIP admin matches identical shared password");
yes(!mi.matches(env.MI_EDITORIAL_ACCESS_KEY),"Old separate MI secret is ignored");
yes(!vip.passwordMatches(env.MI_EDITORIAL_ACCESS_KEY),"VIP rejects old separate MI secret");
yes(!mi.matches("incorrect"),"MI rejects wrong password");
yes(!vip.passwordMatches("incorrect"),"VIP rejects wrong password");
const token=mi.issue();
yes(mi.verify(token),"MI signed session valid before rotation");
env.CM_ADMIN_PASSWORD="Another-unique-password!28";
yes(mi.matches(env.CM_ADMIN_PASSWORD)&&vip.passwordMatches(env.CM_ADMIN_PASSWORD),"Password rotation applies to both");
yes(!mi.verify(token),"Old MI session invalidated by shared password change");
env.CM_ADMIN_PASSWORD="";
yes(!mi.configured()&&!mi.matches("anything"),"Missing shared password fails closed");
console.log("SHARED_ADMIN_PASSWORD_CONTRACT_PASS",checks);
