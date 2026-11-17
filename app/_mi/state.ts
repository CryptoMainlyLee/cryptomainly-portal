import "server-only";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename, unlink, open } from "node:fs/promises";
import seed from "./seed-registry.json";
import baseline from "../vip/market-intelligence/visibility.json";

export const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
export type Day = typeof days[number];
export type Account = {handle:string;market:"crypto"|"stocks"|"both";focus:string};
export type Visibility = {schema_version:1;hidden_edition_slugs:string[];hidden_post_ids_by_edition:Record<string,string[]>};
type Audit = {utc:string;action:string;target:string;reason:string};
export type State = {schema:"cryptomainly-source-registry-v1";revision_sha256:string;updated_at_utc:string;source_count:number;description:string;accounts:Account[];daily_primary_accounts:Record<Day,{uk_time:string;primary_accounts:string[]}>;editorial_visibility:Visibility;editorial_audit:Audit[]};
export type Snapshot = {state:State;version:string;writable:boolean};
// These are dedicated state-only repositories, never the membership website repo.
const previewRepo="CryptoMainlyLee/cryptomainly-editorial-sandbox";
const productionRepo="CryptoMainlyLee/cryptomainly-editorial-registry";
const file="source-registry.json";
const handle=/^[A-Za-z0-9_]{1,15}$/;
const slug=/^20\d{2}-\d{2}-\d{2}$/;
const post=/^\d{14,24}$/;
const reasons=["correction","inappropriate","copyright","outdated","editorial-review"] as const;
export const reasonOptions=reasons;
const cleanText=(s:unknown,min:number,max:number):s is string=>typeof s==="string"&&s.length>=min&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
function hash(s:string){return createHash("sha256").update(s,"utf8").digest("hex")}
function sorted(v:any):any{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])]));return v}
export function revision(s:Pick<State,"accounts"|"daily_primary_accounts">){return hash(JSON.stringify(sorted({accounts:s.accounts,daily_primary_accounts:s.daily_primary_accounts})))}
function validVisibility(v:any):Visibility{
 if(v?.schema_version!==1||!Array.isArray(v.hidden_edition_slugs)||!v.hidden_post_ids_by_edition||typeof v.hidden_post_ids_by_edition!=="object"||Array.isArray(v.hidden_post_ids_by_edition))throw Error("Invalid visibility");
 if(!v.hidden_edition_slugs.every((s:any)=>typeof s==="string"&&slug.test(s))||new Set(v.hidden_edition_slugs).size!==v.hidden_edition_slugs.length)throw Error("Invalid edition IDs");
 for(const [k,ids] of Object.entries(v.hidden_post_ids_by_edition)){if(!slug.test(k)||!Array.isArray(ids)||!ids.every(x=>typeof x==="string"&&post.test(x))||new Set(ids).size!==ids.length)throw Error("Invalid observation IDs")}
 return {schema_version:1,hidden_edition_slugs:[...v.hidden_edition_slugs],hidden_post_ids_by_edition:Object.fromEntries(Object.entries(v.hidden_post_ids_by_edition)) as Record<string,string[]>};
}
export function validate(v:any):State{
 if(v?.schema!=="cryptomainly-source-registry-v1"||!Array.isArray(v.accounts)||v.accounts.length<1||v.accounts.length>50||!v.daily_primary_accounts||Object.keys(v.daily_primary_accounts).length!==7)throw Error("Invalid registry schema");
 const names=new Set<string>();const accounts:Account[]=v.accounts.map((a:any)=>{if(typeof a?.handle!=="string"||!handle.test(a.handle)||names.has(a.handle.toLowerCase())||!["crypto","stocks","both"].includes(a.market)||!cleanText(a.focus,8,180))throw Error("Invalid or duplicate X account");names.add(a.handle.toLowerCase());return {handle:a.handle,market:a.market,focus:a.focus}});
 const daily_primary_accounts=Object.fromEntries(days.map(d=>{const x=v.daily_primary_accounts[d];if(!x||x.uk_time!==(d==="monday"?"10:00":"15:30")||!Array.isArray(x.primary_accounts)||!x.primary_accounts.every((p:any)=>typeof p==="string"&&names.has(p.toLowerCase()))||new Set(x.primary_accounts.map((p:string)=>p.toLowerCase())).size!==x.primary_accounts.length)throw Error("Invalid daily preferences");return [d,{uk_time:x.uk_time,primary_accounts:x.primary_accounts}]})) as State["daily_primary_accounts"];
 const editorial_visibility=validVisibility(v.editorial_visibility??baseline);
 const a=v.editorial_audit??[];if(!Array.isArray(a)||a.length>100||!a.every((x:any)=>cleanText(x?.utc,10,40)&&cleanText(x?.action,3,30)&&cleanText(x?.target,1,80)&&reasons.includes(x?.reason)))throw Error("Invalid audit");
 const state:State={schema:v.schema,revision_sha256:String(v.revision_sha256),updated_at_utc:String(v.updated_at_utc),source_count:accounts.length,description:seed.description,accounts,daily_primary_accounts,editorial_visibility,editorial_audit:a.map((x:Audit)=>({utc:x.utc,action:x.action,target:x.target,reason:x.reason}))};
 if(v.source_count!==accounts.length||state.revision_sha256!==revision(state))throw Error("Registry revision mismatch");return state;
}
function mode(){const m=process.env.MI_EDITORIAL_MODE??"off";if(process.env.VERCEL_ENV==="production"&&m!=="production")throw Error("Production editorial storage must be explicitly configured");if(!["off","local","preview","production"].includes(m))throw Error("Unknown editorial mode");if(m==="local"&&(!process.env.MI_EDITORIAL_TEST_FILE||process.env.VERCEL||process.env.NODE_ENV!=="production"))throw Error("Local test mode requires isolated production-style localhost");if(m==="preview"&&process.env.VERCEL_ENV!=="preview")throw Error("Preview backend isolation failure");if(m==="production"&&process.env.VERCEL_ENV!=="production")throw Error("Production backend isolation failure");return m}
function github(m:string){const token=process.env.MI_EDITORIAL_GITHUB_TOKEN;if(!token)throw Error("Editorial storage unavailable");return {token,repo:m==="preview"?previewRepo:productionRepo,branch:"main"}}
async function ghRead(m:string):Promise<Snapshot>{
 const {token,repo,branch}=github(m);const r=await fetch("https://api.github.com/repos/"+repo+"/contents/"+file+"?ref="+branch,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}});if(!r.ok)throw Error("Editorial registry unavailable");
 const j=await r.json();if(j.type!=="file"||j.path!==file||! /^[a-f0-9]{40}$/.test(j.sha)||j.size>131072||j.encoding!=="base64"||typeof j.content!=="string")throw Error("Invalid hosted registry response");
 const raw=JSON.parse(Buffer.from(j.content,"base64").toString("utf8"));if(!raw.editorial_visibility||!Array.isArray(raw.editorial_audit))throw Error("Hosted state must include explicit moderation and audit fields");return {state:validate(raw),version:j.sha,writable:true};
}
export async function readState():Promise<Snapshot>{
 const m=mode();if(m==="off"){const state=validate(seed);return {state,version:hash(JSON.stringify(state)),writable:false}}
 if(m==="local"){const raw=await readFile(process.env.MI_EDITORIAL_TEST_FILE!,"utf8");if(Buffer.byteLength(raw)>131072)throw Error("Oversized test registry");return {state:validate(JSON.parse(raw)),version:hash(raw),writable:true}}
 return ghRead(m);
}
export async function writeState(expected:string,state:State){
 const m=mode();if(m==="off")throw Error("Editorial changes disabled");const body=JSON.stringify(validate(state),null,2)+"\n";if(Buffer.byteLength(body)>131072)throw Error("Registry too large");
 if(m==="local"){const p=process.env.MI_EDITORIAL_TEST_FILE!;const lock=p+".lock";const f=await open(lock,"wx");try{const current=await readState();if(current.version!==expected)throw Error("Concurrent change; reload");await writeFile(p+".tmp",body,{flag:"wx"});await rename(p+".tmp",p)}finally{await f.close();await unlink(lock)}return}
 const {token,repo,branch}=github(m);if(!/^[a-f0-9]{40}$/.test(expected))throw Error("Invalid revision");
 const r=await fetch("https://api.github.com/repos/"+repo+"/contents/"+file,{method:"PUT",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:JSON.stringify({branch,sha:expected,message:"chore(editorial): reviewed registry update",content:Buffer.from(body).toString("base64")})});
 if(!r.ok)throw Error("Registry change not confirmed; reload before retrying");const j=await r.json();if(!j.commit?.sha||j.content?.path!==file)throw Error("Registry outcome uncertain; reload before retrying");
}
export type Change={action:string;old:string;handle:string;market:string;focus:string;days:string[];slug:string;post:string;reason:string};
export function changed(s:State,c:Change,known:ReadonlyArray<{slug:string;observations:ReadonlyArray<{id:string}>}>):State{
 if(!reasons.includes(c.reason as any))throw Error("Select an editorial reason");const n=structuredClone(s);let target="";
 if(["add-source","edit-source","remove-source"].includes(c.action)){
  const idx=n.accounts.findIndex(a=>a.handle.toLowerCase()===c.old.toLowerCase());if(c.action!=="add-source"&&idx<0)throw Error("Unknown source");if(c.action==="add-source"&&c.old)throw Error("Unexpected source selection");
  if(c.action==="remove-source"){target=n.accounts[idx].handle;n.accounts.splice(idx,1);for(const d of days)n.daily_primary_accounts[d].primary_accounts=n.daily_primary_accounts[d].primary_accounts.filter(h=>h.toLowerCase()!==target.toLowerCase())}
  else{if(!handle.test(c.handle)||!["crypto","stocks","both"].includes(c.market)||!cleanText(c.focus,8,180)||new Set(c.days).size!==c.days.length||!c.days.every(d=>days.includes(d as Day)))throw Error("Invalid account fields");if(n.accounts.some((a,i)=>i!==(c.action==="edit-source"?idx:-1)&&a.handle.toLowerCase()===c.handle.toLowerCase()))throw Error("Duplicate account");
   const a={handle:c.handle,market:c.market as Account["market"],focus:c.focus};if(c.action==="add-source")n.accounts.push(a);else n.accounts[idx]=a;target=c.handle;for(const d of days){const picks=n.daily_primary_accounts[d].primary_accounts.filter(h=>!c.old||h.toLowerCase()!==c.old.toLowerCase());if(c.days.includes(d))picks.push(c.handle);n.daily_primary_accounts[d].primary_accounts=picks}
  }
 }else if(["hide-post","restore-post","hide-edition","restore-edition"].includes(c.action)){
  const e=known.find(x=>x.slug===c.slug);if(!e)throw Error("Unknown edition");const v=n.editorial_visibility;
  if(c.action.endsWith("-post")){if(!e.observations.some(p=>p.id===c.post))throw Error("Unknown observation");target=c.slug+":"+c.post;const ids=new Set(v.hidden_post_ids_by_edition[c.slug]??[]);if(c.action==="hide-post")ids.add(c.post);else ids.delete(c.post);if(ids.size)v.hidden_post_ids_by_edition[c.slug]=[...ids].sort();else delete v.hidden_post_ids_by_edition[c.slug]}
  else{target=c.slug;const hidden=new Set(v.hidden_edition_slugs);if(c.action==="hide-edition")hidden.add(c.slug);else hidden.delete(c.slug);v.hidden_edition_slugs=[...hidden].sort()}
 }else throw Error("Unknown editorial action");
 n.source_count=n.accounts.length;n.revision_sha256=revision(n);n.updated_at_utc=new Date().toISOString();n.editorial_audit=[...n.editorial_audit,{utc:n.updated_at_utc,action:c.action,target,reason:c.reason}].slice(-100);return validate(n);
}
