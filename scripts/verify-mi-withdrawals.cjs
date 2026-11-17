"use strict";
/**
 * Fail-closed, zero-network prebuild gate for editorial withdrawals.
 *
 * If a post or edition is withdrawn, its dated Telegram PNG must be
 * quarantined from public/assets before ANY new public build.
 * It avoids publishing an obsolete screenshot that still shows a removed post.
 */
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const featureDir=path.join(root,"app/vip/market-intelligence");
const visibilityPath=path.join(featureDir,"visibility.json");
const indexPath=path.join(featureDir,"editions.ts");
const slug=/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const postId=/^\d{14,24}$/;
function fail(message){console.error("MI_WITHDRAWAL_PREBUILD_BLOCKED",message);process.exitCode=2;}
try {
 const v=JSON.parse(fs.readFileSync(visibilityPath,"utf8"));
 if(v.schema_version!==1||!Array.isArray(v.hidden_edition_slugs)
   ||!v.hidden_post_ids_by_edition
   ||typeof v.hidden_post_ids_by_edition!=="object"
   ||Array.isArray(v.hidden_post_ids_by_edition))throw Error("Invalid moderation schema");
 const index=fs.readFileSync(indexPath,"utf8");
 const allowed=new Set([...index.matchAll(/\bslug:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})"/g)].map(x=>x[1]));
 const hidden=new Set(v.hidden_edition_slugs);
 if(hidden.size!==v.hidden_edition_slugs.length)throw Error("Duplicate hidden edition");
 const affected=new Set(hidden);
 for(const s of hidden)if(!slug.test(s)||!allowed.has(s))throw Error("Unknown edition removal");
 for(const [s,ids] of Object.entries(v.hidden_post_ids_by_edition)){
    if(!slug.test(s)||!allowed.has(s)||!Array.isArray(ids)||!ids.every(x=>typeof x==="string"&&postId.test(x)))
      throw Error("Invalid hidden post key/IDs");
    if(new Set(ids).size!==ids.length)throw Error("Duplicate hidden post");
    if(ids.length)affected.add(s);
 }
 // V1.19: no dated screenshot may bypass the runtime visibility-aware route.
 const publicDir=path.join(root,"public/assets/market-intelligence");
 if(fs.existsSync(publicDir)&&fs.readdirSync(publicDir).some(n=>n.toLowerCase().endsWith(".png")))throw Error("Market Intelligence PNG must be served by the guarded route, not public/assets");
 for(const s of affected){
   const media=path.join(root,"public/assets/market-intelligence",s+"-telegram.png");
   if(fs.existsSync(media))throw Error("Withdrawn research still has a public dated screenshot: "+s);
 }
 console.log("MI_WITHDRAWAL_PREBUILD_PASSED",JSON.stringify({affectedEditions:[...affected].sort(),noNetwork:true}));
}catch(e){fail(e.message)}
