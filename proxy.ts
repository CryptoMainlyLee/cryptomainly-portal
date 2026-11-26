import { NextRequest, NextResponse } from "next/server";
// Narrowly scoped acceptance-only Proxy; never release onto main.
const BRANCH="feature/mi-v135-next16-writable-test-2026-11-26";
const allowEdit=new Set(["/admin/market-intelligence/session","/admin/market-intelligence/queue/action"]);
const SEND="/admin/market-intelligence/queue/send";
export function proxy(req:NextRequest){
 const e=process.env;
 // Local synthetic E2E tests use their separate filesystem-based registry;
 // Vercel always supplies VERCEL/VERCEL_ENV, so cloud QA still fails closed.
 if(!e.VERCEL&&!e.VERCEL_ENV&&e.NODE_ENV==="production"&&["127.0.0.1","localhost"].includes(req.nextUrl.hostname))return NextResponse.next();
 const same=e.VERCEL_GIT_COMMIT_REF===BRANCH;
 const valid=e.VERCEL==="1"&&e.VERCEL_ENV==="preview"&&same&&e.CM_QA_WRITABLE_SANDBOX==="true"&&e.MI_EDITORIAL_MODE==="preview"&&e.MI_EDITORIAL_QA_BRANCH==="v135-next16-test-20261126"&&e.MI_MAKE_HOSTED_QA==="true";
 if(!valid) return new NextResponse("Isolated writable QA configuration unavailable.",{status:503,headers:{"Cache-Control":"no-store"}});
 const path=req.nextUrl.pathname;
 const method=req.method.toUpperCase();
 if(method!=="GET"&&method!=="HEAD"){
  const editing=method==="POST"&&allowEdit.has(path);
  const singleSend=method==="POST"&&path===SEND&&e.CM_QA_SEND_WINDOW==="ARMED_ONE_MESSAGE"&&e.MI_MAKE_TEST_ENABLED==="true";
  if(!editing&&!singleSend)return new NextResponse("This QA Preview blocks that write operation.",{status:403,headers:{"Cache-Control":"no-store"}});
 }
 const response=NextResponse.next();
 response.headers.set("X-CryptoMainly-QA","sandbox-only");
 response.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
 response.headers.set("Cache-Control","no-store");
 return response;
}
export const config={matcher:"/((?!_next/static|_next/image|favicon.ico).*)"};
