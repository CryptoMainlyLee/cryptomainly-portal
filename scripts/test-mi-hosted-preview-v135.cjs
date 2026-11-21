"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const root=path.resolve(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const code=ts.transpileModule(read("app/_mi/hosted-qa.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const base={MI_MAKE_HOSTED_QA:"true",VERCEL:"1",VERCEL_ENV:"preview",MI_EDITORIAL_MODE:"preview",VERCEL_GIT_COMMIT_REF:"feature/mi-web-one-click-test-2026-11-21",VERCEL_GIT_REPO_SLUG:"cryptomainly-portal",MI_EDITORIAL_QA_BRANCH:"v135-hosted-web-e2e-20261121"};
function qa(env){const out={};vm.runInNewContext(code,{exports:out,process:{env},require(name){if(name==="server-only")return {};throw Error("Unexpected "+name)}});return out;}
let n=0;function ok(x,label){assert(x,label);n++;console.log("PASS",label)}
ok(qa(base).hostedQaIsolated()===true&&qa(base).hostedQaStorageBranch()==="v135-hosted-web-e2e-20261121","Pinnned Preview+separate sandbox branch accepted");
for(const [label,key,value] of [
["missing opt-in","MI_MAKE_HOSTED_QA",""],["no Vercel","VERCEL",""],["Production","VERCEL_ENV","production"],["local","VERCEL_ENV",""],["wrong editorial mode","MI_EDITORIAL_MODE","production"],
["wrong web branch","VERCEL_GIT_COMMIT_REF","main"],["wrong Git repo","VERCEL_GIT_REPO_SLUG","other-portal"],["wrong sandbox state branch","MI_EDITORIAL_QA_BRANCH","main"]
]){
 const env={...base,[key]:value};
 ok(qa(env).hostedQaIsolated()===false,label+" disables QA");
 if(env.MI_MAKE_HOSTED_QA==="true")ok((()=>{try{qa(env).hostedQaStorageBranch();return false}catch{return true}})(),label+" blocks storage");
 else ok(qa(env).hostedQaStorageBranch()===null,label+" leaves normal storage unchanged");
}
const qr=read("app/_mi/review-queue.ts"),st=read("app/_mi/state.ts"),vo=read("app/_mi/vip-outbox.ts");
ok(qr.includes('branch:m==="preview"?(hostedQaStorageBranch()??"main"):"main"'),"Queue repo branch switches only inside pinned Preview");
ok(qr.includes('"?ref="+encodeURIComponent(branch)'),"Queue GET reads dedicated branch");
ok(qr.includes('const payload:any={branch,message:'),"Queue PUT writes dedicated branch");
ok(st.includes('branch:m==="preview"?(hostedQaStorageBranch()??"main"):"main"'),"Source registry uses same sandbox branch");
ok(vo.includes('MI_MAKE_HOSTED_QA==="true"&&!hostedQa'),"Invalid hosted opt-in explicitly disables Make sending");
ok(vo.includes('const destination="TEST_ONLY"'),"Live VIP destination remains server-pinned out");
console.log("HOSTED_PREVIEW_SANDBOX_GUARDS_PASS",n);
