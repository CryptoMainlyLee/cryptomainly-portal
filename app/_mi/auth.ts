import "server-only";
import { createHash,createHmac,randomBytes,timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
export const editorPath="/admin/market-intelligence";
const name="cm_mi_editor";
// Both administrator areas use the same server-side password source.
// Keep their session cookies and permissions separate.
function secret(){
 const s=process.env.CM_ADMIN_PASSWORD;
 return typeof s==="string"&&s.length>0&&s.length<=256?s:null;
}
export function configured(){return !!secret()}
function mac(data:string){const key=secret();if(!key)throw Error("Editorial access not configured");return createHmac("sha256",key).update(data).digest("hex")}
function equal(a:string,b:string){return timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest())}
export function matches(input:string){const key=secret();return !!key&&input.length<=256&&equal(input,key)}
export function issue(){const body=String(Math.floor(Date.now()/1000)+3600)+"."+randomBytes(24).toString("hex");return body+"."+mac("session:"+body)}
export function verify(token:string){if(!secret()||!/^\d{10}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token))return false;const [expiry,nonce,sig]=token.split(".");const now=Math.floor(Date.now()/1000);return Number(expiry)>now&&Number(expiry)<=now+3600&&equal(sig,mac("session:"+expiry+"."+nonce))}
export async function session(){const token=(await cookies()).get(name)?.value??"";return verify(token)?token:null}
export function csrf(token:string){return mac("csrf:"+token)}
export function csrfOK(token:string,input:string){return input.length===64&&equal(input,csrf(token))}
export async function setSession(value:string,maxAge=3600){(await cookies()).set(name,value,{httpOnly:true,secure:process.env.VERCEL==="1"||process.env.MI_EDITORIAL_MODE!=="local",sameSite:"strict",path:editorPath,maxAge})}
function deploymentOrigin(){
 const h=process.env.VERCEL_URL??"";
 if(!h.endsWith(".vercel.app")||!/^[a-z0-9-]+$/.test(h.slice(0,-11)))throw Error("Unknown Vercel deployment origin");
 return "https://"+h;
}
export function trustedOrigin(req:Request){
 if(process.env.VERCEL_ENV==="production"){
  const requestOrigin=new URL(req.url).origin;
  // Keep the normal public administrator on its canonical custom domain.
  if(requestOrigin==="https://www.cryptomainly.co.uk")return requestOrigin;
  // Allow ONLY this build's verified deployment hostname for staged-prod QA.
  // Never accept an arbitrary *.vercel.app hostname or spoofed Origin header.
  if(requestOrigin===deploymentOrigin())return requestOrigin;
  throw Error("Untrusted production origin");
 }
 if(process.env.VERCEL_ENV==="preview")return deploymentOrigin();
 if(process.env.MI_EDITORIAL_MODE==="local")return "http://127.0.0.1:3197";
 return new URL(req.url).origin;
}
export async function form(req:Request,maxBytes=8192){if(req.headers.get("origin")!==trustedOrigin(req)||req.headers.get("sec-fetch-site")==="cross-site")throw Error("Cross-origin request rejected");if(!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))throw Error("Unsupported form");const length=Number(req.headers.get("content-length"));if(maxBytes>32768||maxBytes<8192)throw Error("Unsupported form limit");if(!Number.isFinite(length)||length<0||length>maxBytes)throw Error("Oversized form");const reader=req.body?.getReader();if(!reader)throw Error("Missing body");let bytes=0;const chunks:Uint8Array[]=[];try{for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.length;if(bytes>maxBytes)throw Error("Oversized form");chunks.push(x.value)}}finally{await reader.cancel().catch(()=>{})}return new URLSearchParams(Buffer.concat(chunks).toString("utf8"))}
