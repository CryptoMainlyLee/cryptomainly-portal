"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),ts=require("typescript");
const root=path.resolve(__dirname,"..");const source=JSON.parse(fs.readFileSync(path.join(root,"app/_mi/seed-registry.json"),"utf8"));
function load(relative,other={},environment={}){
 const target={};
 const js=ts.transpileModule(fs.readFileSync(path.join(root,relative),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{exports:target,require(name){if(name==="server-only")return {};if(name==="node:crypto")return crypto;if(name==="node:fs/promises")return require("node:fs/promises");if(name==="./state")return {};if(other[name])return other[name];throw Error("Unexpected dependency: "+name)},process:{env:environment},Buffer,URL,Date,structuredClone,AbortSignal,Response,console,fetch:async (...args)=>{calls.push(args);return fakeResponse}}, {filename:relative});
 return target;
}
let calls=[],fakeResponse=null,count=0;const ok=(x,m)=>{assert.ok(x,m);count++;console.log("PASS",m)},fails=(fn,m)=>{assert.throws(fn);count++;console.log("PASS",m)};
const queue=load("app/_mi/review-queue.ts");
const disabled=load("app/_mi/vip-outbox.ts",{"./review-queue":queue});
const now=new Date("2026-11-20T23:25:00.000Z");
const values={
 action:"add",id:"",kind:"data",market:"crypto",url:"https://x.com/Barchart/status/2123613914432762273",source_handle:"Barchart",title:"Synthetic test household macro index headline",
 summary:"Synthetic review candidate: a labelled macro series measures household financial pressure relative to historic values.",
 why_it_matters:"This is a test-only editor workflow, not a real trading recommendation or verified prediction.",
 limitations:"The underlying index methodology and image permissions require explicit editorial judgement.",
 published_at_utc:"2026-11-20T03:06:26.696Z",edition_date:"2026-11-20",score:"83",evidence:[],reason:"Synthetic owner review and single VIP destination confirmation",confirm:"yes"
};
let state=queue.updateQueue(queue.emptyQueue(),values,source,[],now);
const id=state.items[0].id;
ok(disabled.vipConfig().enabled===false,"Outbound disabled until dedicated Telegram configuration");
ok(disabled.composeVipText(state.items[0]).includes(values.url),"Original canonical source always appended");
const custom="CryptoMainly VIP insight: original market research shows household pressure; please read the underlying chart first.";
let reserved=disabled.reserveVipSend(state,id,{...values,action:"edit",id,vip_post_text:custom,vip_image_url:""},source,[],now);
ok(reserved.state.items[0].vip_delivery.status==="reserved","Owner click persists reservation before network");
ok(reserved.message.includes(custom)&&reserved.message.includes(values.url),"Edited VIP message text and source preserved");
ok(reserved.state.items[0].status==="candidate","Single send does not require old six evidence tick boxes");
ok(Object.values(reserved.state.items[0].evidence).every(x=>x===false),"No evidence attestations falsely minted by send");
fails(()=>disabled.reserveVipSend(reserved.state,id,{...values,action:"edit",id,vip_post_text:custom,vip_image_url:""},source,[],now),"Duplicate click blocked after reservation");
const ack=disabled.recordVipSend(reserved.state,id,reserved.requestId,{ok:true,messageId:987654},now);
ok(ack.items[0].vip_delivery.status==="sent"&&ack.items[0].vip_delivery.telegram_message_id===987654,"Positive Telegram acknowledgement recorded");
fails(()=>disabled.reserveVipSend(ack,id,{...values,action:"edit",id,vip_post_text:custom,vip_image_url:""},source,[],now),"Delivered message cannot be resent");
const uncertain=disabled.recordVipSend(reserved.state,id,reserved.requestId,{ok:false},now);
ok(uncertain.items[0].vip_delivery.status==="unknown","Uncertain Telegram outcome is locked against replay");
fails(()=>disabled.reserveVipSend(uncertain,id,{...values,action:"edit",id,vip_post_text:custom,vip_image_url:""},source,[],now),"Uncertain outcome cannot be automatically retried");
fails(()=>disabled.recordVipSend(reserved.state,id,crypto.randomUUID(),{ok:true,messageId:987654},now),"Wrong reservation id rejected");
ok(disabled.vipConfig().reason.includes("not connected"),"No bot credentials or membership bot reused");
fails(()=>queue.vipImageUrl("https://images.cryptoquant.com/research.png"),"Third-party chart direct redistribution blocked");
fails(()=>queue.vipImageUrl("https://www.cryptomainly.co.uk/admin/vip/members.png"),"Private/internal image URL rejected");
fails(()=>queue.vipImageUrl("http://www.cryptomainly.co.uk/assets/market-intelligence/own.png"),"Non-HTTPS images rejected");
ok(queue.vipImageUrl("https://www.cryptomainly.co.uk/assets/market-intelligence/our-own-chart.png").endsWith("our-own-chart.png"),"Verified first-party chart URL accepted");
fails(()=>disabled.reserveVipSend(state,id,{...values,action:"edit",id,confirm:"",vip_post_text:custom},source,[],now),"Checkbox required before outbound send");
fails(()=>disabled.reserveVipSend(state,id,{...values,action:"edit",id,vip_post_text:"x".repeat(3800)},source,[],now),"Overlength caption rejected before reserving");
const prepared=queue.updateQueue(state,{...values,action:"edit",id,vip_post_text:"A safe edited draft of the same market information.",vip_image_url:""},source,[],now);
ok(!prepared.items[0].vip_delivery&&prepared.items[0].status==="candidate","Save changes alone does not send VIP message");
const archivedEdited=queue.updateQueue(state,{...values,action:"edit",id,vip_post_text:"An owner-edited highlight of a post already available on the website."},source,[values.url],now);
ok(archivedEdited.items.length===1&&archivedEdited.items[0].vip_post_text.includes("website"),"Owner may highlight a previously website-published observation without duplicating the archive");
fails(()=>queue.updateQueue(queue.emptyQueue(),values,source,[values.url],now),"Adding a duplicate already published original still forbidden");
const fakeConfig={VERCEL_ENV:"production",MI_EDITORIAL_MODE:"production",MI_VIP_SEND_ENABLED:"true",MI_VIP_BOT_TOKEN:"123456789:"+"A".repeat(35),MI_VIP_CHAT_ID:"-1009876543210"};
const enabled=load("app/_mi/vip-outbox.ts",{"./review-queue":queue},fakeConfig);
ok(enabled.vipConfig().enabled===true,"Isolated mocked VIP configuration accepted");
fakeResponse={ok:true,json:async()=>({ok:true,result:{message_id:8811,chat:{id:-1009876543210}}})};
(async()=>{
 const sent=await enabled.sendTelegramVip(reserved.item,reserved.message);
 ok(sent.messageId===8811,"Mock Telegram acknowledges one outbound post");
 ok(calls.length===1,"Exactly one outbound Telegram API request in normal path");
 ok(calls[0][0].includes("api.telegram.org/")&&calls[0][0].endsWith("/sendMessage"),"Only official Telegram Bot API used for text with source preview");
 const body=JSON.parse(calls[0][1].body);
 ok(body.chat_id===fakeConfig.MI_VIP_CHAT_ID&&body.link_preview_options.url===values.url,"Explicit VIP destination and source-image preview preserved");
 fakeResponse={ok:true,json:async()=>({ok:true,result:{message_id:8812,chat:{id:-1001112223334}}})};
 await assert.rejects(enabled.sendTelegramVip(reserved.item,reserved.message));count++;console.log("PASS","Wrong Telegram chat acknowledgement rejected");
 const img=queue.updateQueue(state,{...values,action:"edit",id,vip_image_url:"https://www.cryptomainly.co.uk/assets/market-intelligence/own-chart.png",vip_post_text:"Our own licensed chart provides original market context."},source,[],now);
 fakeResponse={ok:true,json:async()=>({ok:true,result:{message_id:8813,chat:{id:-1009876543210}}})};
 const photomsg=enabled.composeVipText(img.items[0]);
 const pic=await enabled.sendTelegramVip(img.items[0],photomsg);
 ok(pic.messageId===8813&&calls[calls.length-1][0].endsWith("/sendPhoto"),"Approved first-party image uses Telegram sendPhoto");
 const picbody=JSON.parse(calls[calls.length-1][1].body);
 ok(picbody.photo==="https://www.cryptomainly.co.uk/assets/market-intelligence/own-chart.png","Only owner-hosted image sent to Telegram");
 console.log("VIP_ONE_CLICK_SECURITY_REGRESSION_PASS",count,"SYNTHETIC_ONLY_NOT_SENT");
})().catch(err=>{console.error(err.stack);process.exitCode=2});
