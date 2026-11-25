"use strict";
const expectedWebBranch="feature/mi-web-one-click-test-2026-11-21";
const expectedSandboxBranch="v135-hosted-web-e2e-20261121";
const E=process.env;
// Short-lived Preview-only diagnostic. Never print, store, or transfer credentials.
if(E.MI_MAKE_HOSTED_QA!=="true"||E.VERCEL_ENV!=="preview"){
  console.log("MI_V135_HOSTED_PREFLIGHT_SKIP_NON_QA");
  process.exit(0);
}
(async()=>{
 const facts={
  platform:E.VERCEL==="1",
  webBranch:E.VERCEL_GIT_COMMIT_REF===expectedWebBranch,
  repoSlug:E.VERCEL_GIT_REPO_SLUG==="cryptomainly-portal",
  editorialPreview:E.MI_EDITORIAL_MODE==="preview",
  qaBranch:E.MI_EDITORIAL_QA_BRANCH===expectedSandboxBranch,
  tokenPresent:typeof E.MI_EDITORIAL_GITHUB_TOKEN==="string"&&E.MI_EDITORIAL_GITHUB_TOKEN.length>=20,
  publishDisabled:E.MI_MAKE_TEST_ENABLED==="false",
  makeDestinationTestOnly:E.MI_MAKE_DESTINATION==="TEST_ONLY"
 };
 console.log("MI_V135_HOSTED_QA_GATE_FACTS",JSON.stringify(facts));
 if(!facts.webBranch||!facts.qaBranch||!facts.publishDisabled||!facts.makeDestinationTestOnly){
   console.log("MI_V135_HOSTED_PREFLIGHT_STOP_UNSAFE_CONFIGURATION");return;
 }
 if(!facts.tokenPresent){console.log("MI_V135_HOSTED_GITHUB_READ",{status:"token_absent"});return;}
 try{
  const baseHeaders={Authorization:"Bearer "+E.MI_EDITORIAL_GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  const paths=[["identity","/user"],["sandboxRepo","/repos/CryptoMainlyLee/cryptomainly-editorial-sandbox"],["sandboxMainFile","/repos/CryptoMainlyLee/cryptomainly-editorial-sandbox/contents/source-registry.json?ref=main"]];
  const access={};
  for(const [name,path] of paths){try{const r=await fetch("https://api.github.com"+path,{redirect:"error",signal:AbortSignal.timeout(6500),headers:baseHeaders});access[name]=r.status;}catch(e){access[name]=e?.name==="TimeoutError"?"timeout":"transport_error";}}
  console.log("MI_V135_HOSTED_GITHUB_SCOPE",JSON.stringify(access));
  const url="https://api.github.com/repos/CryptoMainlyLee/cryptomainly-editorial-sandbox/contents/source-registry.json?ref="+encodeURIComponent(expectedSandboxBranch);
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+E.MI_EDITORIAL_GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}});
  let valid=false,shaFormat=false,sourceCount=null;
  if(response.ok){
   const j=await response.json();
   valid=j.type==="file"&&j.path==="source-registry.json"&&j.encoding==="base64"&&j.size<131072&&typeof j.content==="string";
   shaFormat=typeof j.sha==="string"&&/^[0-9a-f]{40}$/.test(j.sha);
   if(valid){try{const v=JSON.parse(Buffer.from(j.content,"base64").toString("utf8"));sourceCount=Array.isArray(v.accounts)?v.accounts.length:null;}catch{}}
  }
  console.log("MI_V135_HOSTED_GITHUB_READ",JSON.stringify({httpStatus:response.status,validFileShape:valid,shaFormat,sourceCount}));
 }catch(e){
  const category=e?.name==="TimeoutError"?"timeout":e?.name==="AbortError"?"aborted":"transport_error";
  console.log("MI_V135_HOSTED_GITHUB_READ",JSON.stringify({category}));
 }
})().catch(()=>console.log("MI_V135_HOSTED_PREFLIGHT_UNEXPECTED"));
