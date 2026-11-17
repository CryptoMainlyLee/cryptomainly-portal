import {readFile} from "node:fs/promises";
import path from "node:path";
import {imageAllowed} from "../../../_mi/public-editions";
export const dynamic="force-dynamic";
export const revalidate=0;
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
export async function GET(_req:Request,{params}:{params:{image:string}}){
 if(params.image!=="2026-11-15-telegram.png")return new Response(null,{status:404,headers});
 try{if(!await imageAllowed("2026-11-15"))return new Response(null,{status:404,headers});const bytes=await readFile(path.join(process.cwd(),"private","market-intelligence","2026-11-15-telegram.png"));return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":"image/png"}})}catch{return new Response(null,{status:503,headers})}
}
