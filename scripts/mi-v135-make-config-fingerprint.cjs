"use strict";
const {createHash}=require("node:crypto");
const e=process.env;
if(e.MI_MAKE_HOSTED_QA==="true"&&e.VERCEL_ENV==="preview"&&e.MI_MAKE_TEST_ENABLED==="false"&&e.VERCEL_GIT_COMMIT_REF==="feature/mi-web-one-click-test-2026-11-21"){
  const hash=s=>createHash("sha256").update(s,"utf8").digest("hex");
  const expectedUrlHash="2251bd0614f5b306e6ba7f8e932af7a7099ce136b6fe9c722e59ed064184439a";
  const expectedKeyHash="bf46ed85312a678b69c5dd3c58ea0495f2757f57a1bf5431554bf3fc42e7b871";
  const url=e.MI_MAKE_WEBHOOK_URL??"",key=e.MI_MAKE_WEBHOOK_API_KEY??"";
  console.log("MI_V135_PRIVATE_MAKE_CONFIG_COMPARE",JSON.stringify({
    previewOnly:true,
    sendingDisabled:true,
    urlConfigured:!!url,
    keyConfigured:!!key,
    urlMatchesVerifiedMakeHook:hash(url)===expectedUrlHash,
    keyMatchesVerifiedDPAPICopy:hash(key)===expectedKeyHash,
    noSecretValuesLogged:true
  }));
}else console.log("MI_V135_PRIVATE_MAKE_CONFIG_SKIP");
