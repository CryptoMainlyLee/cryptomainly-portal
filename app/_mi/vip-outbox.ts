import "server-only";
import {randomUUID} from "node:crypto";
import {sourceIdentity,updateQueue,queueRevision,validateQueue,type QueueState,type QueueItem,type QueueInput,type VipDelivery} from "./review-queue";
import type {State as SourceState} from "./state";

// Dedicated Make.com delivery transport. Never use membership credentials or post directly to Telegram.
const TEST_CHAT_ID="-1004432697280";
const MAKE_SCHEMA="cryptomainly-vip-delivery-v1";
const RECEIPT_SCHEMA="cryptomainly-make-delivery-receipt-v1";
export type VipConfig={enabled:boolean;reason:string;destination:"TEST_ONLY"};
export function makeWebhookURL(raw:string):URL{
 let url:URL;try{url=new URL(raw)}catch{throw Error("Make webhook URL not configured")}
 if(url.protocol!=="https:"||url.hostname!=="hook.eu2.make.com"||url.username||url.password||url.port||url.search||url.hash||!/^\/[A-Za-z0-9_-]{20,128}$/.test(url.pathname))throw Error("Only the pinned EU2 Make webhook endpoint is permitted");
 return url;
}
export function vipConfig():VipConfig{
 const disabled=(reason:string):VipConfig=>({enabled:false,reason,destination:"TEST_ONLY"});
 if(process.env.MI_MAKE_TEST_ENABLED!=="true")return disabled("Make.com TEST-group delivery is not connected yet. Your drafts remain private.");
 // Isolated localhost acceptance QA may use a *copy* of editorial source/queue files.
 // This gate cannot be enabled on Vercel and never permits a real VIP destination.
 const isolatedLocalQa=process.env.MI_MAKE_LOCAL_QA==="true"&&process.env.MI_EDITORIAL_MODE==="local"&&process.env.NODE_ENV==="production"&&!process.env.VERCEL&&!process.env.VERCEL_ENV&&!!process.env.MI_EDITORIAL_TEST_QUEUE_FILE&&!!process.env.MI_EDITORIAL_TEST_FILE;
 if(!isolatedLocalQa&&(process.env.VERCEL_ENV!=="production"||process.env.MI_EDITORIAL_MODE!=="production"))return disabled("Test-group sending is disabled outside authorised Production mode.");
 if(process.env.MI_MAKE_DESTINATION!=="TEST_ONLY")return disabled("Only the isolated TEST_ONLY destination is permitted.");
 try{makeWebhookURL(process.env.MI_MAKE_WEBHOOK_URL??"")}catch{return disabled("The Make.com webhook endpoint is not configured securely.")}
 const key=process.env.MI_MAKE_WEBHOOK_API_KEY??"";
 if(key.length<20||key.length>256||! /^[A-Za-z0-9_-]+$/.test(key))return disabled("The Make.com webhook authentication key is unavailable.");
 return {enabled:true,destination:"TEST_ONLY",reason:"Make.com TEST-group destination configured. This cannot send to the actual VIP group."};
}
export function composeVipText(item:QueueItem):string{
 const body=item.vip_post_text?.trim()||["📈 CryptoMainly VIP · Market Intelligence",item.title,item.summary,"Why it matters: "+item.why_it_matters,"Limitations: "+item.limitations].join("\n\n");
 const canonical=sourceIdentity(item.url).url;
 const text=body.includes(canonical)?body:body+"\n\nOriginal source: "+canonical;
 if(text.length>3800)throw Error("VIP message exceeds safe Telegram length");
 return text;
}
export type Reservation={state:QueueState;item:QueueItem;requestId:string;message:string};
export function reserveVipSend(state:QueueState,itemId:string,fields:QueueInput,sources:SourceState,historicUrls:readonly string[],now=new Date()):Reservation{
 const item=state.items.find(x=>x.id===itemId);
 if(!item||item.status==="rejected")throw Error("Only active, visible candidates can be sent");
 if(item.vip_delivery)throw Error("VIP delivery already reserved, sent or uncertain; cannot replay");
 if(fields.confirm!=="yes")throw Error("You must confirm this VIP delivery");
 const edited=updateQueue(state,{...fields,id:itemId,action:"edit",confirm:"yes",reason:"Owner confirmed edited content for one VIP Telegram delivery"},sources,historicUrls,now);
 const index=edited.items.findIndex(x=>x.id===itemId);
 if(index<0)throw Error("Edited VIP candidate missing");
 const latest=edited.items[index];
 const text=composeVipText(latest);
 if(latest.vip_image_url&&text.length>920)throw Error("Photo caption exceeds safe Telegram length; shorten VIP message or omit the image");
 const requestId=randomUUID();
 const delivery:VipDelivery={status:"reserved",request_id:requestId,reserved_at_utc:now.toISOString()};
 latest.vip_delivery=delivery;
 latest.updated_at_utc=now.toISOString();
 edited.audit=[...edited.audit,{utc:now.toISOString(),action:"vip_send_reserved",item_id:itemId,reason:"One confirmed manual owner send; no automatic retry"}].slice(-200);
 edited.revision_sha256=queueRevision(edited.items);
 return {state:validateQueue(edited),item:latest,requestId,message:text};
}
export function recordVipSend(state:QueueState,itemId:string,requestId:string,result:{ok:boolean;messageId?:number},now=new Date()):QueueState{
 const next=structuredClone(state),item=next.items.find(x=>x.id===itemId);
 if(!item||item.vip_delivery?.request_id!==requestId||item.vip_delivery.status!=="reserved")throw Error("VIP delivery reservation no longer valid");
 const delivery=item.vip_delivery;
 if(result.ok){
  if(!Number.isSafeInteger(result.messageId)||(result.messageId??0)<=0)throw Error("Missing Telegram message receipt");
  delivery.status="sent";delivery.telegram_message_id=result.messageId;
 }else delivery.status="unknown";
 delivery.finished_at_utc=now.toISOString();
 item.updated_at_utc=now.toISOString();
 next.updated_at_utc=now.toISOString();
 next.audit=[...next.audit,{utc:now.toISOString(),action:result.ok?"vip_sent":"vip_delivery_unknown",item_id:itemId,reason:result.ok?"Telegram acknowledged the outbound VIP post":"Uncertain outcome: check the destination before any manual resolution"}].slice(-200);
 next.revision_sha256=queueRevision(next.items);
 return validateQueue(next);
}
export async function sendMakeTest(item:QueueItem,message:string,requestId:string):Promise<{messageId:number}>{
 if(!vipConfig().enabled)throw Error("Make test delivery is not authorised");
 if(!/^[0-9a-f-]{36}$/.test(requestId))throw Error("Invalid delivery reservation ID");
 // Pinned Test-only destination. Never accept a Telegram ID from the browser, research scan or submitted JSON.
 const destination="TEST_ONLY";
 const payload={
  schema:MAKE_SCHEMA,
  edition_id:"HIGHLIGHT_"+requestId,
  delivery_id:requestId,
  content_type:"vip_highlight",
  destination,
  approved:true,
  summary:message,
  edition_url:sourceIdentity(item.url).url,
  image_url:item.vip_image_url??"",
  published_date:new Date().toISOString().slice(0,10),
  chart_count:item.kind==="technical"?1:0
 };
 const url=makeWebhookURL(process.env.MI_MAKE_WEBHOOK_URL??"");
 const key=process.env.MI_MAKE_WEBHOOK_API_KEY!;
 let response:Response;
 try{
  response=await fetch(url.href,{method:"POST",headers:{"Content-Type":"application/json","x-make-apikey":key},body:JSON.stringify(payload),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(25000)});
 }catch{throw Error("Make webhook delivery outcome is uncertain; do not retry automatically")}
 // Make's default HTTP 200 'Accepted' only means queued, NOT successfully sent to Telegram.
 // A custom Webhook Response module must be LAST in the scenario and return the verified
 // Telegram module message ID, destination and original delivery_id as JSON.
 if(!response.ok||!response.headers.get("content-type")?.toLowerCase().includes("application/json"))throw Error("No verified Make Telegram delivery receipt; do not retry automatically");
 let ack:any;
 try{ack=await response.json()}catch{throw Error("Invalid Make delivery receipt")}
 if(ack?.schema!==RECEIPT_SCHEMA||ack.status!=="sent"||ack.delivery_id!==requestId||ack.destination!==destination||String(ack.chat_id)!==TEST_CHAT_ID||!Number.isSafeInteger(ack.message_id)||ack.message_id<=0)throw Error("Make did not provide an exact TEST-group Telegram delivery confirmation");
 return {messageId:ack.message_id};
}
