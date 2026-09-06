// Phase 2 walkthrough: the app shell (drawer), Ask-first Home, My Classes,
// Profile, and the course landing (= Ask). Money guard armed. Temp; deleted after.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3500";
const OUT = "C:/Users/Shyam Chavda/.claude/jobs/adfc0096/tmp/phase2-shots";
mkdirSync(OUT, { recursive: true });
const VP = { desktop:{width:1440,height:900}, tablet:{width:820,height:1180}, mobile:{width:390,height:844} };
const BLOCK = /\/api\/(lectures\/[^/]+\/(extract|transcribe|poll)|courses\/[^/]+\/ask|ask(?!\/conversations))(\/|\?|$)/;
const HOSTS = ["api.sarvam.ai","generativelanguage.googleapis.com","api.openai.com","api.groq.com"];
const blocked = [];
async function guard(ctx){ await ctx.route("**/*",(r)=>{const u=r.request().url();let h="";try{h=new URL(u).hostname;}catch{}; if(BLOCK.test(u)||HOSTS.some(x=>h.endsWith(x))){blocked.push(u);return r.abort("blockedbyclient");} return r.continue();}); }
async function settle(p){ await p.waitForLoadState("networkidle").catch(()=>{}); await p.waitForTimeout(800); }

const ACC = { student:{e:"student.test@classmind.local",p:"ClassMindTest!2026"}, faculty:{e:"faculty.test@classmind.local",p:"ClassMindTest!2026"} };
const browser = await chromium.launch();
async function stateFor(role){ const ctx=await browser.newContext({baseURL:BASE}); await guard(ctx); const p=await ctx.newPage(); await p.goto("/signin",{waitUntil:"networkidle"}); await p.fill("input[type=email]",ACC[role].e); await p.fill("input[type=password]",ACC[role].p); await p.click("button[type=submit]"); await p.waitForURL("**/courses",{timeout:20000}); const s=await ctx.storageState(); await ctx.close(); return s; }

async function shot(state, name, path, vp, {drawer=false, full=true}={}){
  const ctx=await browser.newContext({baseURL:BASE,viewport:VP[vp],colorScheme:"dark",storageState:state,deviceScaleFactor:1});
  await guard(ctx); const p=await ctx.newPage();
  await p.goto(path,{waitUntil:"domcontentloaded"}); await settle(p);
  if(drawer){ const b=p.locator('button[aria-label="Open navigation menu"]').first(); if(await b.count()){ await b.click(); await p.waitForTimeout(500); } }
  await p.screenshot({path:`${OUT}/${name}--${vp}.png`, fullPage: full && !drawer, animations:"disabled"});
  console.log("  ✓ "+name+"--"+vp+(drawer?" (drawer)":""));
  await ctx.close();
}

const student = await stateFor("student");
const faculty = await stateFor("faculty");

console.log("STUDENT:");
await shot(student,"p2-home","/courses","desktop");
await shot(student,"p2-home","/courses","tablet");
await shot(student,"p2-home","/courses","mobile");
await shot(student,"p2-drawer","/courses","desktop",{drawer:true,full:false});
await shot(student,"p2-drawer","/courses","mobile",{drawer:true,full:false});
await shot(student,"p2-classes","/classes","desktop");
await shot(student,"p2-classes","/classes","mobile");
await shot(student,"p2-profile","/profile","desktop");
await shot(student,"p2-profile","/profile","mobile");
await shot(student,"p2-course","/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a","desktop");
await shot(student,"p2-course","/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a","mobile");
await shot(student,"p2-lecture","/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a/lectures/87a4a143-2f88-40fd-9bc2-8e1bd71c0ce8","desktop");

console.log("FACULTY:");
await shot(faculty,"p2-fac-home","/courses","desktop");
await shot(faculty,"p2-fac-classes","/classes","desktop");
await shot(faculty,"p2-fac-drawer","/courses","desktop",{drawer:true,full:false});

await browser.close();
console.log(`DONE. ${blocked.length} paid requests blocked. -> ${OUT}`);
