import "server-only";
import {sourceIdentity,updateQueue,type QueueInput,type QueueState,type Kind,type Market} from "./review-queue";
import type {State as SourceState} from "./state";

export const SCANNER_IMPORT_SCHEMA="cryptomainly-scanner-review-intake-v1" as const;
const day=/^20\d{2}-\d{2}-\d{2}$/;
const stamp=/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const scanId=/^[A-Za-z0-9_-]{10,96}$/;
const sha=/^[0-9a-f]{64}$/;
function properStamp(s:string){return stamp.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,19)===s.slice(0,19)}
function properDay(s:string){return day.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00.000Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s}
export type IncomingResearch={
 kind:Kind;market:Market;url:string;source_handle:string;title:string;summary:string;why_it_matters:string;limitations:string;published_at_utc:string;edition_date:string;score:number;
};
export type ScanBatch={
 schema:typeof SCANNER_IMPORT_SCHEMA;scan_id:string;generated_at_utc:string;source_registry_revision:string;items:IncomingResearch[];
};
export type ScanImportResult={state:QueueState;added:number;alreadyQueued:number;scanId:string;changed:boolean};
function keysExactly(value:Record<string,unknown>,names:readonly string[]){
 return Object.keys(value).length===names.length&&names.every(k=>Object.prototype.hasOwnProperty.call(value,k));
}
const batchFields=["schema","scan_id","generated_at_utc","source_registry_revision","items"] as const;
const itemFields=["kind","market","url","source_handle","title","summary","why_it_matters","limitations","published_at_utc","edition_date","score"] as const;
export function decodeScannerBatch(text:string,now=new Date()):ScanBatch{
 if(typeof text!=="string"||Buffer.byteLength(text,"utf8")>24000||text.length<80)throw Error("Invalid scan intake size");
 let raw:any;
 try{raw=JSON.parse(text)}catch{throw Error("Invalid scan JSON")}
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||!keysExactly(raw,batchFields))throw Error("Invalid scan envelope");
 if(raw.schema!==SCANNER_IMPORT_SCHEMA||!scanId.test(raw.scan_id)||!sha.test(raw.source_registry_revision)||!properStamp(raw.generated_at_utc))throw Error("Invalid scan identifiers");
 const age=now.getTime()-Date.parse(raw.generated_at_utc);
 if(age < -300000||age > 3*86400000)throw Error("Stale or future scanner run");
 if(!Array.isArray(raw.items)||raw.items.length<1||raw.items.length>12)throw Error("Scanner batch must have 1–12 candidates");
 const urls=new Set<string>();
 for(const i of raw.items){
  if(!i||typeof i!=="object"||Array.isArray(i)||!keysExactly(i,itemFields))throw Error("Invalid candidate fields");
  if(!["technical","data"].includes(i.kind)||!["crypto","stocks","macro"].includes(i.market)||!Number.isInteger(i.score)||i.score<0||i.score>100)throw Error("Invalid scanner classification");
  if(typeof i.url!=="string"||typeof i.source_handle!=="string")throw Error("Invalid source reference");
  const canonical=sourceIdentity(i.url);
  if(i.url!==canonical.url||! /^[A-Za-z0-9_]{1,15}$/.test(i.source_handle)||canonical.handle?.toLowerCase()!==i.source_handle.toLowerCase())throw Error("Scanner must provide canonical original source and matching author");
  const key=canonical.url.toLowerCase();
  if(urls.has(key))throw Error("Duplicate canonical link in scanner batch");
  urls.add(key);
  if(typeof i.published_at_utc!=="string"||!(properStamp(i.published_at_utc)||properDay(i.published_at_utc)))throw Error("Unverified scanner publication date format");
  const sourceTime=Date.parse(i.published_at_utc);
  if(sourceTime>now.getTime()+300000||now.getTime()-sourceTime>336*3600000)throw Error("Source outside accepted research window");
  if(typeof i.edition_date!=="string"||!properDay(i.edition_date))throw Error("Invalid edition day");
  for(const [key,min,max] of [["title",12,130],["summary",30,950],["why_it_matters",20,650],["limitations",20,650]] as const){
   const t=i[key];if(typeof t!=="string"||t!==t.trim()||t.length<min||t.length>max||/[\u0000-\u001f\u007f]/.test(t))throw Error("Invalid scanner "+key);
  }
 }
 return raw as ScanBatch;
}
export function importScannerBatch(current:QueueState,batch:ScanBatch,sources:SourceState,historicUrls:readonly string[],now=new Date()):ScanImportResult{
 if(batch.source_registry_revision!==sources.revision_sha256)throw Error("Scanner roster has changed; recheck source authority");
 const historic=new Set(historicUrls.map(s=>sourceIdentity(s).url.toLowerCase()));
 const existing=new Set(current.items.map(x=>x.url.toLowerCase()));
 let next=current,added=0,alreadyQueued=0;
 for(const i of batch.items){
  const url=sourceIdentity(i.url).url.toLowerCase();
  if(historic.has(url))throw Error("Scanner repeated previously published research");
  if(existing.has(url)){alreadyQueued++;continue}
  const reason="Scanner "+batch.scan_id+" source link imported as unapproved editorial candidate";
  const input:QueueInput={
   action:"add",id:"",kind:i.kind,market:i.market,url:i.url,source_handle:i.source_handle,
   title:i.title,summary:i.summary,why_it_matters:i.why_it_matters,limitations:i.limitations,
   published_at_utc:i.published_at_utc,edition_date:i.edition_date,score:String(i.score),
   evidence:[],reason,confirm:"yes"
  };
  next=updateQueue(next,input,sources,historicUrls,now);
  existing.add(url);added++;
 }
 return {state:next,added,alreadyQueued,scanId:batch.scan_id,changed:added>0};
}
