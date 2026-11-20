import {session,csrfOK,form,trustedOrigin} from "../../../../_mi/auth";
import {readQueue,writeQueue} from "../../../../_mi/review-queue";
import {decodeScannerBatch,importScannerBatch} from "../../../../_mi/scanner-import";
import {EDITORIAL_SOURCE_EDITIONS} from "../../../../vip/market-intelligence/editions";
export const dynamic="force-dynamic";
const base="/admin/market-intelligence/queue";
function back(req:Request,suffix:string){return Response.redirect(new URL(base+suffix,trustedOrigin(req)),303)}
export async function POST(req:Request){
 const token=await session();
 if(!token)return new Response("Unauthorized",{status:401});
 let data:URLSearchParams;
 try{
  data=await form(req,32768);
  if(!csrfOK(token,data.get("csrf")??""))return new Response("Forbidden",{status:403});
 }catch{return new Response("Forbidden",{status:403})}
 try{
  const snap=await readQueue();
  if(!snap.writable)return new Response("Disabled",{status:503});
  if(snap.version!==data.get("version"))return back(req,"?error=stale");
  if(data.getAll("scan_payload").length!==1)throw Error("Invalid scan form");
  const raw=data.get("scan_payload")??"";
  const batch=decodeScannerBatch(raw);
  const history=EDITORIAL_SOURCE_EDITIONS.flatMap(e=>e.observations.map(x=>x.url));
  const result=importScannerBatch(snap.state,batch,snap.source,history);
  if(result.changed)await writeQueue(snap.version,result.state);
  const params=new URLSearchParams({imported:String(result.added),existing:String(result.alreadyQueued)});
  return back(req,"?"+params.toString());
 }catch{return back(req,"?error=import")}
}
