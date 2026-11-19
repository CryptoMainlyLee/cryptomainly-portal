"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cm-editorial-v119-')),stateFile=path.join(tmp,'registry.json');
const seed=JSON.parse(fs.readFileSync(path.join(root,'app/_mi/seed-registry.json'),'utf8'));fs.writeFileSync(stateFile,JSON.stringify({...seed,editorial_visibility:{schema_version:1,hidden_edition_slugs:[],hidden_post_ids_by_edition:{}},editorial_audit:[]}));
const secret=crypto.randomBytes(32).toString('base64url'),origin='http://127.0.0.1:3197',admin='/admin/market-intelligence',latest='/vip/market-intelligence',edition=latest+'/archive/2026-11-15',asset='/assets/market-intelligence/2026-11-15-telegram.png',hidden='2121688198112067943',other='2121674564476309524';
const env={...process.env,MI_EDITORIAL_MODE:'local',MI_EDITORIAL_TEST_FILE:stateFile,MI_EDITORIAL_ACCESS_KEY:secret,CM_ADMIN_PASSWORD:'synthetic-review-local-only',NODE_ENV:'production'};
delete env.VERCEL;delete env.VERCEL_ENV;delete env.MI_EDITORIAL_GITHUB_TOKEN;
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3197','-H','127.0.0.1'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);const wait=ms=>new Promise(r=>setTimeout(r,ms));let count=0;let cookie='';
async function get(p,headers={}){return fetch(origin+p,{redirect:'manual',headers});}
async function roster(){const r=await get('/api/market-intelligence/source-registry');equal(r.status,200,'public registry projection HTTP 200');ck(r.headers.get('cache-control').includes('no-store'),'registry uncached');const j=await r.json();ck(Object.keys(j).sort().join(',')==='accounts,daily_primary_accounts,revision_sha256,schema,source_count,updated_at_utc','strict public-only projection');equal(j.revision_sha256,read().revision_sha256,'scanner and editor same revision');return j}
async function post(p,body,headers={}){return fetch(origin+p,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body)});}
const read=()=>JSON.parse(fs.readFileSync(stateFile,'utf8'));
function ck(value,label){assert.ok(value,label);count++;console.log('PASS',label)}
function equal(a,b,label){assert.equal(a,b,label);count++;console.log('PASS',label)}
async function form(){const r=await get(admin,{Cookie:cookie});equal(r.status,200,'authenticated editor HTTP 200');const html=await r.text();const fields={};for(const k of ['csrf','version']){const m=html.match(new RegExp('name="'+k+'" value="([^"]+)"'));assert.ok(m,'missing '+k);fields[k]=m[1]}return{html,...fields}}
async function change(action,data={},extra={}){const {csrf,version}=await form();return post(admin+'/action',{csrf,version,action,reason:'editorial-review',confirm:'yes',...data,...extra},{Cookie:cookie});}
function saved(r){equal(r.status,303,'action redirects');ck(r.headers.get('location').endsWith('?saved=1'),'action saved')}
(async()=>{try{
 let ready=false;for(let i=0;i<50;i++){try{const r=await get(admin);if(r.status===200){ready=true;break}}catch{}await wait(300)}ck(ready,'isolated server started');
 const initial=await roster();equal(initial.source_count,14,'baseline public roster');
 const search=await get(latest+'/archive?q=75400');equal(search.status,200,'archive keyword response');
 const hits=await get(latest+'/archive?q=Rekt+Capital&market=crypto&date=2026-11-15');ck((await hits.text()).includes('Bitcoin&#x27;s failed $75.5k retest'),'archive searches all public observations by analyst/date/category');
 const miss=await get(latest+'/archive?q=CM_QA_NOT_A_REAL_ASSET');ck((await miss.text()).includes('No public research matches your search'),'archive empty result');
 const anon=await get(admin);const an=await anon.text();ck(!an.includes('PeterLBrandt')&&!an.includes(hidden),'anonymous editor reveals no data');
 equal((await post(admin+'/action',{action:'hide-edition'})).status,401,'anonymous write denied');
 equal((await post(admin+'/session',{key:secret},{Origin:'https://wrong.example'})).status,403,'cross-origin login denied');
 const wrong=await post(admin+'/session',{key:'incorrect-key'});ck(wrong.status===303&&!wrong.headers.get('set-cookie'),'wrong credential denied (HTTP '+wrong.status+')');
 const login=await post(admin+'/session',{key:secret});equal(login.status,303,'valid login redirect');const sc=login.headers.get('set-cookie');ck(sc&&/HttpOnly/i.test(sc)&&/SameSite=strict/i.test(sc)&&/Path=\/admin\/market-intelligence/i.test(sc),'isolated HttpOnly strict cookie');cookie=sc.split(';')[0];
 const auth=await form();ck(auth.html.includes('PeterLBrandt')&&auth.html.includes(hidden)&&auth.html.includes('Add an X account'),'authorized account and post controls rendered');
 const forged=await get(admin,{Cookie:cookie.slice(0,-1)+(cookie.endsWith('a')?'b':'a')});ck(!(await forged.text()).includes('PeterLBrandt'),'tampered session rejected');
 equal((await post(admin+'/action',{csrf:'0'.repeat(64),version:auth.version,action:'hide-edition',slug:'2026-11-15',confirm:'yes',reason:'correction'},{Cookie:cookie})).status,403,'bad CSRF denied');
 equal((await post(admin+'/action',{csrf:auth.csrf,version:auth.version,action:'hide-edition',slug:'2026-11-15',confirm:'yes',reason:'correction'},{Cookie:cookie,Origin:'https://wrong.example'})).status,403,'cross-origin mutation denied');
 const missing=await change('hide-edition',{slug:'2026-11-15'},{confirm:'no'});ck(missing.headers.get('location').endsWith('?error=confirm'),'confirmation required');
 saved(await change('add-source',{handle:'CM_QA_Fixture',market:'crypto',focus:'Synthetic test only technical charts',day:'monday'}));
 equal(read().source_count,15,'account added');ck((await roster()).accounts.some(a=>a.handle==='CM_QA_Fixture'),'added source visible in public scanner projection');ck(read().daily_primary_accounts.monday.primary_accounts.includes('CM_QA_Fixture'),'priority day added');
 const stale=await post(admin+'/action',{csrf:auth.csrf,version:auth.version,action:'remove-source',old:'CM_QA_Fixture',reason:'correction',confirm:'yes'},{Cookie:cookie});ck(stale.headers.get('location').endsWith('?error=stale'),'stale revision rejected');
 const dup=await change('add-source',{handle:'cm_qa_fixture',market:'crypto',focus:'Invalid duplicate fixture'});ck(dup.headers.get('location').endsWith('?error=save'),'case-insensitive duplicate rejected');
 saved(await change('edit-source',{old:'CM_QA_Fixture',handle:'CM_QA_Renamed',market:'stocks',focus:'Synthetic edited chart focus',day:'tuesday'}));
 ck(!read().daily_primary_accounts.monday.primary_accounts.includes('CM_QA_Fixture')&&read().daily_primary_accounts.tuesday.primary_accounts.includes('CM_QA_Renamed'),'rename preserves valid priority references');
 saved(await change('remove-source',{old:'CM_QA_Renamed'}));equal(read().source_count,14,'account removed');
 ck(!Object.values(read().daily_primary_accounts).flatMap(x=>x.primary_accounts).some(x=>x.includes('CM_QA')),'priority references cleaned');
 equal(read().revision_sha256,seed.revision_sha256,'canonical roster hash restored exactly');ck(!(await roster()).accounts.some(a=>a.handle.startsWith('CM_QA')),'removed source absent in projection');
 const img=await get(asset);equal(img.status,200,'original screenshot served');ck(img.headers.get('cache-control').includes('no-store'),'screenshot no-store');const bytes=Buffer.from(await img.arrayBuffer());ck(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a','PNG signature');
 ck((await (await get(latest)).text()).includes(hidden),'original post visible');
 saved(await change('hide-post',{slug:'2026-11-15',post:hidden}));
 for(const p of [latest,edition]){const r=await get(p);equal(r.status,200,p+' remains visible');const html=await r.text();ck(!html.includes(hidden)&&html.includes(other),p+' hidden ID absent, other post retained');const rsc=await get(p,{'RSC':'1'});ck(!(await rsc.text()).includes(hidden),p+' RSC excludes hidden ID')}
 const hiddenSearch=await get(latest+'/archive?q=failed+retest');ck(!(await hiddenSearch.text()).includes('Bitcoin&#x27;s failed $75.5k retest'),'withdrawn title absent from global archive search');
 equal((await get(asset)).status,404,'withdrawn post blocks stale PNG');
 const bad=await change('hide-post',{slug:'2026-11-15',post:'9999999999999999'});ck(bad.headers.get('location').endsWith('?error=save'),'unknown post rejected');
 saved(await change('restore-post',{slug:'2026-11-15',post:hidden}));equal((await get(asset)).status,200,'restored PNG permitted');ck((await (await get(edition)).text()).includes(hidden),'restored post visible');
 saved(await change('hide-edition',{slug:'2026-11-15'}));for(const p of [latest,edition]){const r=await get(p);equal(r.status,404,p+' whole-edition 404');ck(!(await r.text()).includes(hidden),'withdrawn originals not leaked')};equal((await get(asset)).status,404,'withdrawn edition blocks image');
 const idx=await get(latest+'/archive');equal(idx.status,200,'archive index still works');ck(!(await idx.text()).includes('Open this edition'),'archive listing removed');
 saved(await change('restore-edition',{slug:'2026-11-15'}));equal((await get(edition)).status,200,'edition restored');equal((await get(asset)).status,200,'image restored');
 equal(read().editorial_audit.length,7,'seven successful changes audited, rejected writes excluded');
 const before=fs.readFileSync(stateFile,'utf8');fs.writeFileSync(stateFile,'{"invalid":true}');for(const p of [latest,edition]){const r=await get(p);ck(r.status>=400&&!(await r.text()).includes(hidden),'corrupt storage fails closed '+p)}equal((await get(asset)).status,503,'image fails closed on invalid state');equal((await get('/api/market-intelligence/source-registry')).status,503,'invalid state fails closed for scanner');ck((await (await get(admin,{Cookie:cookie})).text()).includes('Editorial storage unavailable'),'admin blocks corrupt storage');fs.writeFileSync(stateFile,before);
 const final=await form();const logout=await post(admin+'/session',{logout:'1',csrf:final.csrf},{Cookie:cookie});ck(logout.status===303&&/Max-Age=0/i.test(logout.headers.get('set-cookie')||''),'logout clears cookie');
 console.log('MI_EDITORIAL_E2E_PASSED',JSON.stringify({checks:count,audit:read().editorial_audit.length,sourceRosterUnchanged:read().revision_sha256===seed.revision_sha256,storage:'disposable local file',productionTouched:false}));
 }catch(e){console.error('MI_EDITORIAL_E2E_FAILED',e.message);process.exitCode=2}finally{server.kill();await wait(350);fs.rmSync(tmp,{recursive:true,force:true});}})();