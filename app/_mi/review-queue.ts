import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {readFile,writeFile,rename,unlink,open} from "node:fs/promises";
import {readState,type State as SourceState} from "./state";

export type Kind="technical"|"data";
export type Market="crypto"|"stocks"|"macro";
export type Status="candidate"|"approved_for_review"|"rejected";
export type Evidence={original_source:boolean;timestamp:boolean;visual_or_data:boolean;methodology:boolean;rights:boolean;uk_review:boolean};
export type VipDelivery={status:"reserved"|"sent"|"unknown";request_id:string;reserved_at_utc:string;finished_at_utc?:string;telegram_message_id?:number};
export type QueueItem={id:string;kind:Kind;market:Market;status:Status;url:string;source_handle:string;title:string;summary:string;why_it_matters:string;limitations:string;published_at_utc:string;edition_date:string;score:number;evidence:Evidence;vip_highlight:boolean;vip_post_text?:string;vip_image_url?:string;vip_delivery?:VipDelivery;created_at_utc:string;updated_at_utc:string};
type Audit={utc:string;action:string;item_id:string;reason:string};
export type QueueState={schema:"cryptomainly-editorial-queue-v1";revision_sha256:string;updated_at_utc:string;items:QueueItem[];audit:Audit[]};
export type QueueSnapshot={state:QueueState;version:string;writable:boolean;source:SourceState};
export type QueueInput={action:string;id:string;kind:string;market:string;url:string;source_handle:string;title:string;summary:string;why_it_matters:string;limitations:string;published_at_utc:string;edition_date:string;score:string;evidence:string[];reason:string;confirm:string;vip_post_text?:string;vip_image_url?:string};
const filename="editorial-queue-v1.json";
const modeSet=new Set(["off","local","preview","production"]);
const handles=/^[A-Za-z0-9_]{1,15}$/;
const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const day=/^20\d{2}-\d{2}-\d{2}$/;
export function vipImageUrl(value:string){
 if(!value)return "";
 if(value.length>500)throw Error("VIP image link is too long");
 let url:URL;try{url=new URL(value)}catch{throw Error("Invalid image URL")}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||url.search||!["www.cryptomainly.co.uk","cryptomainly.co.uk"].includes(url.hostname.toLowerCase())||!/^\/assets\/market-intelligence\/[A-Za-z0-9_\/-]+\.(?:png|jpe?g|webp)$/i.test(url.pathname))throw Error("VIP images must be approved first-party CryptoMainly assets");
 return url.href;
}
export function vipPostCopy(value:string){
 if(value.length>2400||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error("Invalid VIP message copy");
 return value.trim();
}

const fields:ReadonlyArray<keyof Evidence>=["original_source","timestamp","visual_or_data","methodology","rights","uk_review"];
const textOK=(v:unknown,min:number,max:number)=>typeof v==="string"&&v.trim()===v&&v.length>=min&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const dateOK=(s:string)=>iso.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,19)===s.slice(0,19);
function sort(v:any):any{if(Array.isArray(v))return v.map(sort);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v}
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export function queueRevision(items:QueueItem[]){return hash(JSON.stringify(sort(items)))}
export function emptyQueue():QueueState{const items:QueueItem[]=[];return {schema:"cryptomainly-editorial-queue-v1",revision_sha256:queueRevision(items),updated_at_utc:"1970-01-01T00:00:00.000Z",items,audit:[]}}
export function sourceIdentity(u:string):{url:string;handle:string|null}{
 if(u.length>500)throw Error("Source URL too long");
 let x:URL;try{x=new URL(u)}catch{throw Error("Invalid source URL")}
 if(x.protocol!=="https:"||x.username||x.password||x.port||x.hash)throw Error("Only public HTTPS original links permitted");
 const h=x.hostname.toLowerCase();x.search="";x.hash="";
 if(h==="x.com"||h==="twitter.com"){const m=x.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{14,24})\/?$/);if(!m)throw Error("Expected canonical original X post");return {url:"https://x.com/"+m[1]+"/status/"+m[2],handle:m[1]}}
 const providerHandle:Record<string,string>={"research.glassnode.com":"glassnode","glassnode.com":"glassnode","www.glassnode.com":"glassnode","cryptoquant.com":"cryptoquant_com","www.cryptoquant.com":"cryptoquant_com","coinglass.com":"coinglass_com","www.coinglass.com":"coinglass_com"};
 if(providerHandle[h]&&x.pathname.length>5&&!x.pathname.includes(".."))return {url:"https://"+h+x.pathname,handle:providerHandle[h]};
 throw Error("Unapproved research domain: propose source for review");
}
export function validateQueue(value:any):QueueState{
 if(value?.schema!=="cryptomainly-editorial-queue-v1"||!Array.isArray(value.items)||value.items.length>100||!Array.isArray(value.audit)||value.audit.length>200)throw Error("Invalid queue envelope");
 if(!dateOK(value.updated_at_utc))throw Error("Invalid queue timestamp");
 const ids=new Set<string>(),urls=new Set<string>();
 const items:QueueItem[]=value.items.map((i:any)=>{
  if(typeof i?.id!=="string"||!/^[0-9a-f-]{36}$/.test(i.id)||ids.has(i.id)||!["technical","data"].includes(i.kind)||!["crypto","stocks","macro"].includes(i.market)||!["candidate","approved_for_review","rejected"].includes(i.status))throw Error("Invalid or duplicate queue item");
  ids.add(i.id);
  const source=sourceIdentity(i.url);
  if(source.url!==i.url||!handles.test(i.source_handle)||source.handle&&source.handle.toLowerCase()!==i.source_handle.toLowerCase())throw Error("Source identity mismatch");
  if(urls.has(source.url.toLowerCase()))throw Error("Duplicate original post or article");urls.add(source.url.toLowerCase());
  for(const [k,min,max] of [["title",12,130],["summary",30,950],["why_it_matters",20,650],["limitations",20,650]] as const){if(!textOK(i[k],min,max))throw Error("Invalid "+k)}
  if(!(dateOK(i.published_at_utc)||(i.status==="candidate"&&day.test(i.published_at_utc)&&new Date(i.published_at_utc+"T00:00:00Z").toISOString().slice(0,10)===i.published_at_utc))||!dateOK(i.created_at_utc)||!dateOK(i.updated_at_utc)||!day.test(i.edition_date)||new Date(i.edition_date+"T00:00:00Z").toISOString().slice(0,10)!==i.edition_date)throw Error("Invalid dates");
  if(!Number.isInteger(i.score)||i.score<0||i.score>100||typeof i.vip_highlight!=="boolean")throw Error("Invalid score or highlight flag");
  if(!i.evidence||Object.keys(i.evidence).length!==fields.length||!fields.every(f=>typeof i.evidence[f]==="boolean"))throw Error("Invalid editorial evidence");
  if(i.status!=="approved_for_review"&&i.vip_highlight)throw Error("Highlight must be review-approved");
  if(i.status==="approved_for_review"&&(i.score<80||!fields.every(f=>i.evidence[f])))throw Error("Approved item lacks evidence");
  if(i.vip_post_text!==undefined&&(typeof i.vip_post_text!=="string"||i.vip_post_text!==vipPostCopy(i.vip_post_text)))throw Error("Invalid VIP draft text");
  if(i.vip_image_url!==undefined&&(typeof i.vip_image_url!=="string"||i.vip_image_url!==vipImageUrl(i.vip_image_url)))throw Error("Invalid first-party image");
  if(i.vip_delivery!==undefined){
   const v=i.vip_delivery;
   if(!v||!["reserved","sent","unknown"].includes(v.status)||typeof v.request_id!=="string"||!/^[0-9a-f-]{36}$/.test(v.request_id)||!dateOK(v.reserved_at_utc))throw Error("Invalid VIP send reservation");
   if(v.status==="sent"&&(!dateOK(v.finished_at_utc)||!Number.isSafeInteger(v.telegram_message_id)||v.telegram_message_id<=0))throw Error("Invalid VIP sent receipt");
   if(v.status==="unknown"&&!dateOK(v.finished_at_utc))throw Error("Invalid VIP uncertain receipt");
  }
  return {...i,evidence:{...i.evidence}};
 });
 for(const a of value.audit){if(!a||!dateOK(a.utc)||!textOK(a.action,3,32)||!textOK(a.item_id,8,40)||!textOK(a.reason,8,200))throw Error("Invalid queue audit")}
 const state:QueueState={schema:"cryptomainly-editorial-queue-v1",revision_sha256:String(value.revision_sha256),updated_at_utc:value.updated_at_utc,items,audit:value.audit};
 if(state.revision_sha256!==queueRevision(state.items))throw Error("Queue integrity check failed");
 return state;
}
function mode(){
 const m=process.env.MI_EDITORIAL_MODE??"off";
 if(!modeSet.has(m))throw Error("Invalid queue storage mode");
 if(process.env.VERCEL_ENV==="production"&&m!=="production")throw Error("Production must use isolated editorial storage");
 if(m==="preview"&&process.env.VERCEL_ENV!=="preview")throw Error("Preview backend isolation failed");
 if(m==="production"&&process.env.VERCEL_ENV!=="production")throw Error("Production backend isolation failed");
 if(m==="local"&&(!process.env.MI_EDITORIAL_TEST_QUEUE_FILE||!process.env.MI_EDITORIAL_TEST_FILE||process.env.VERCEL||process.env.NODE_ENV!=="production"))throw Error("Local test files not explicitly isolated");
 return m;
}
function credentials(m:string){const token=process.env.MI_EDITORIAL_GITHUB_TOKEN;if(!token)throw Error("Queue storage unavailable");return {token,repo:m==="preview"?"CryptoMainlyLee/cryptomainly-editorial-sandbox":"CryptoMainlyLee/cryptomainly-editorial-registry"}}
function headers(token:string){return {Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}}
export async function readQueue():Promise<QueueSnapshot>{
 const m=mode();const source=(await readState()).state;
 if(m==="off")return {state:emptyQueue(),version:"readonly",writable:false,source};
 if(m==="local"){
  const path=process.env.MI_EDITORIAL_TEST_QUEUE_FILE!;let raw:string;
  try{raw=await readFile(path,"utf8")}catch(e:any){if(e?.code==="ENOENT")return {state:emptyQueue(),version:"missing",writable:true,source};throw e}
  if(Buffer.byteLength(raw)>131072)throw Error("Queue oversized");
  return {state:validateQueue(JSON.parse(raw)),version:hash(raw),writable:true,source};
 }
 const {token,repo}=credentials(m);
 const r=await fetch("https://api.github.com/repos/"+repo+"/contents/"+filename+"?ref=main",{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000),headers:headers(token)});
 if(r.status===404)return {state:emptyQueue(),version:"missing",writable:true,source}; // readState already proved access to this same private repo
 if(!r.ok)throw Error("Private queue unavailable");
 const j=await r.json();
 if(j.type!=="file"||j.path!==filename||! /^[a-f0-9]{40}$/.test(j.sha)||j.size>131072||j.encoding!=="base64"||typeof j.content!=="string")throw Error("Invalid queue response");
 const raw=Buffer.from(j.content,"base64").toString("utf8");
 return {state:validateQueue(JSON.parse(raw)),version:j.sha,writable:true,source};
}
export async function writeQueue(expected:string,next:QueueState){
 const m=mode();if(m==="off")throw Error("Queue changes disabled");
 const body=JSON.stringify(validateQueue(next),null,2)+"\n";if(Buffer.byteLength(body)>131072)throw Error("Queue oversized");
 const cur=await readQueue();if(!cur.writable||cur.version!==expected)throw Error("Concurrent queue change; reload");
 if(m==="local"){
  const p=process.env.MI_EDITORIAL_TEST_QUEUE_FILE!,lock=p+".lock",file=await open(lock,"wx");
  try{await writeFile(p+".tmp",body,{flag:"wx"});await rename(p+".tmp",p)}finally{await file.close();await unlink(lock).catch(()=>{})}
  return;
 }
 const {token,repo}=credentials(m);
 const payload:any={branch:"main",message:"chore(editorial): reviewed research queue update",content:Buffer.from(body).toString("base64")};
 if(expected!=="missing"){if(!/^[a-f0-9]{40}$/.test(expected))throw Error("Invalid queue file version");payload.sha=expected}
 const res=await fetch("https://api.github.com/repos/"+repo+"/contents/"+filename,{method:"PUT",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),headers:{...headers(token),"Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!res.ok)throw Error("Private queue change not confirmed; reload");
 const j=await res.json();if(j.content?.path!==filename||!j.commit?.sha)throw Error("Queue update outcome unknown; reload");
}
const approvalEvidenceNames:ReadonlyArray<[keyof Evidence,string]>=[
 ["original_source","Original first-party source has not been confirmed"],
 ["timestamp","Original publication timestamp has not been checked"],
 ["visual_or_data","Original chart or quantitative data has not been inspected"],
 ["methodology","Data methodology and interpretation limits have not been checked"],
 ["rights","Rights, permitted sharing and attribution have not been reviewed"],
 ["uk_review","UK financial-promotion and compliance review remains incomplete"]
];
export function approvalBlockers(item:QueueItem,sources:SourceState,now=new Date()):string[]{
 const reasons:string[]=[];
 if(item.status!=="candidate")return ["Only candidates can be marked review-approved"];
 if(item.score<80)reasons.push("Editorial quality score must be at least 80/100");
 for(const [field,label] of approvalEvidenceNames){if(!item.evidence[field])reasons.push(label)}
 if(!dateOK(item.published_at_utc))reasons.push("Exact original publication time in UTC is required (YYYY-MM-DD alone is insufficient)");
 else{
  const age=now.getTime()-Date.parse(item.published_at_utc);
  if(age< -300000)reasons.push("Original publication timestamp is in the future");
  else if(age>336*3600000)reasons.push("Original research is older than the 14-day approval window");
 }
 const identity=sourceIdentity(item.url);
 if(!identity.handle||!sources.accounts.some(a=>a.handle.toLowerCase()===identity.handle!.toLowerCase()))reasons.push("Original research provider must be an approved account in the source registry");
 return reasons;
}
export function updateQueue(current:QueueState,input:QueueInput,sources:SourceState,historicUrls:readonly string[],now=new Date()):QueueState{
 if(input.confirm!=="yes"||!textOK(input.reason,8,200))throw Error("Confirm with an editorial reason");
 const n=structuredClone(current);const action=input.action,at=now.toISOString();
 const position=n.items.findIndex(x=>x.id===input.id);
 if(!["add","edit","approve","reject","reopen","highlight","unhighlight"].includes(action))throw Error("Unknown queue operation");
 let id=input.id;
 if(action==="add"||action==="edit"){
  if(action==="edit"&&position<0)throw Error("Unknown queue item");
  if(action==="add"&&input.id)throw Error("Cannot select ID when adding");
  const url=sourceIdentity(input.url);
  if(historicUrls.some(raw=>sourceIdentity(raw).url.toLowerCase()===url.url.toLowerCase())&&(action==="add"||url.url.toLowerCase()!==n.items[position].url.toLowerCase()))throw Error("This original source was already published in the historical archive");
  if(!handles.test(input.source_handle)||url.handle&&url.handle.toLowerCase()!==input.source_handle.toLowerCase())throw Error("Source handle inconsistent with original X URL");
  const score=Number(input.score);
  if(!Number.isInteger(score)||score<0||score>100)throw Error("Invalid editorial score");
  if(!(dateOK(input.published_at_utc)||(day.test(input.published_at_utc)&&new Date(input.published_at_utc+"T00:00:00Z").toISOString().slice(0,10)===input.published_at_utc))||Date.parse(input.published_at_utc)>now.getTime()+300000||!day.test(input.edition_date)||new Date(input.edition_date+"T00:00:00Z").toISOString().slice(0,10)!==input.edition_date)throw Error("Invalid observation date");
  if(!["technical","data"].includes(input.kind)||!["crypto","stocks","macro"].includes(input.market))throw Error("Invalid research category");
  const evidence=Object.fromEntries(fields.map(k=>[k,input.evidence.includes(k)])) as Evidence;
  if(new Set(input.evidence).size!==input.evidence.length||!input.evidence.every(k=>fields.includes(k as keyof Evidence)))throw Error("Invalid evidence names");
  if(n.items.some((x,i)=>i!==position&&x.url.toLowerCase()===url.url.toLowerCase()))throw Error("Original source already in queue");
  id=action==="add"?randomUUID():n.items[position].id;
  const item:QueueItem={id,kind:input.kind as Kind,market:input.market as Market,status:"candidate",url:url.url,source_handle:input.source_handle,title:input.title,summary:input.summary,why_it_matters:input.why_it_matters,limitations:input.limitations,published_at_utc:input.published_at_utc,edition_date:input.edition_date,score,evidence,vip_highlight:false,created_at_utc:action==="add"?at:n.items[position].created_at_utc,updated_at_utc:at,
   vip_post_text:vipPostCopy(input.vip_post_text??(action==="edit"?n.items[position].vip_post_text??"":"")),
   vip_image_url:vipImageUrl(input.vip_image_url??(action==="edit"?n.items[position].vip_image_url??"":"")),
   ...(action==="edit"&&n.items[position].vip_delivery?{vip_delivery:n.items[position].vip_delivery}:{})};
  if(action==="add")n.items.push(item);else n.items[position]=item;
 }else{
  if(position<0)throw Error("Unknown queue item");
  const item=n.items[position];id=item.id;
  if(action==="approve"){
   const pending=approvalBlockers(item,sources,now);
   if(pending.length)throw Error("Approval blocked; outstanding verification requirements");
   item.status="approved_for_review";
  }else if(action==="reject"){item.status="rejected";item.vip_highlight=false}
  else if(action==="reopen"){item.status="candidate";item.vip_highlight=false}
  else if(action==="highlight"){if(item.status!=="approved_for_review")throw Error("Only reviewed items may be highlighted");item.vip_highlight=true}
  else if(action==="unhighlight")item.vip_highlight=false;
  item.updated_at_utc=at;
 }
 n.audit=[...n.audit,{utc:at,action,item_id:id,reason:input.reason}].slice(-200);
 n.updated_at_utc=at;n.revision_sha256=queueRevision(n.items);
 return validateQueue(n);
}
export function editionDraft(state:QueueState,date:string,sources:SourceState,now=new Date()){
 if(!day.test(date))throw Error("Invalid edition date");
 return state.items.filter(i=>{
  const identity=sourceIdentity(i.url);
  return i.edition_date===date&&i.status==="approved_for_review"&&Date.parse(i.published_at_utc)<=now.getTime()+300000&&now.getTime()-Date.parse(i.published_at_utc)<=336*3600*1000&&!!identity.handle&&sources.accounts.some(s=>s.handle.toLowerCase()===identity.handle!.toLowerCase());
 }).sort((a,b)=>b.score-a.score);
}
