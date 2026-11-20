import "server-only";
import {randomUUID} from "node:crypto";
import {sourceIdentity,updateQueue,queueRevision,validateQueue,type QueueState,type QueueItem,type QueueInput,type VipDelivery} from "./review-queue";
import type {State as SourceState} from "./state";

const BOT_URL="https://api.telegram.org/";
export type VipConfig={enabled:boolean;reason:string};
export function vipConfig():VipConfig{
 const explicit=process.env.MI_VIP_SEND_ENABLED==="true";
 if(!explicit)return {enabled:false,reason:"VIP sending is not connected yet. Your drafts remain private."};
 if(process.env.VERCEL_ENV!=="production"||process.env.MI_EDITORIAL_MODE!=="production")return {enabled:false,reason:"Sending is disabled outside the authorised Production environment."};
 if(!/^\d{5,12}:[A-Za-z0-9_-]{30,}$/.test(process.env.MI_VIP_BOT_TOKEN??"")||!/^\-100\d{6,15}$/.test(process.env.MI_VIP_CHAT_ID??""))return {enabled:false,reason:"VIP bot credentials or destination are not configured."};
 return {enabled:true,reason:"VIP bot connection configured. A confirmed click sends to the VIP group."};
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
export async function sendTelegramVip(item:QueueItem,message:string):Promise<{messageId:number}>{
 const config=vipConfig();
 if(!config.enabled)throw Error("VIP delivery is not authorised");
 const token=process.env.MI_VIP_BOT_TOKEN!;
 const chat=process.env.MI_VIP_CHAT_ID!;
 const hasPhoto=!!item.vip_image_url;
 const method=hasPhoto?"sendPhoto":"sendMessage";
 const payload=hasPhoto?{chat_id:chat,photo:item.vip_image_url,caption:message,protect_content:true,allow_paid_broadcast:false}:{chat_id:chat,text:message,link_preview_options:{url:item.url,prefer_large_media:true},protect_content:true,allow_paid_broadcast:false};
 let response:Response;
 try{response=await fetch(BOT_URL+"bot"+token+"/"+method,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)})}catch{throw Error("Telegram outcome uncertain")}
 let body:any;
 try{body=await response.json()}catch{throw Error("Telegram response uncertain")}
 if(!response.ok||body?.ok!==true||!Number.isSafeInteger(body?.result?.message_id)||String(body.result?.chat?.id)!==chat)throw Error("Telegram delivery not positively acknowledged");
 return {messageId:body.result.message_id};
}
