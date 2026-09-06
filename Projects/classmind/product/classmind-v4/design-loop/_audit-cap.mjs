// PRODUCT WALKTHROUGH capture — drives the real running app as student, faculty,
// and anon across every screen + key interaction states, at 3 viewports.
// Money guard armed: no paid endpoint can fire on render. Temp file; deleted after.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3500";
const OUT = "C:/Users/Shyam Chavda/.claude/jobs/adfc0096/tmp/audit-shots";
mkdirSync(OUT, { recursive: true });
const ACC = {
  student: { email: "student.test@classmind.local", password: "ClassMindTest!2026" },
  faculty: { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" },
};
const VP = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};
const BLOCK = /\/api\/(lectures\/[^/]+\/(extract|transcribe|poll)|courses\/[^/]+\/ask|ask(?!\/conversations))(\/|\?|$)/;
const HOSTS = ["api.sarvam.ai","api.groq.com","generativelanguage.googleapis.com","api.openai.com","api.mistral.ai","api.sambanova.ai"];
const blocked = [];

async function guard(ctx) {
  await ctx.route("**/*", (r) => {
    const u = r.request().url(); let h=""; try { h=new URL(u).hostname; } catch {}
    if (BLOCK.test(u) || HOSTS.some(x=>h.endsWith(x))) { blocked.push(u); return r.abort("blockedbyclient"); }
    return r.continue();
  });
}
async function stateFor(browser, role) {
  const ctx = await browser.newContext({ baseURL: BASE });
  await guard(ctx);
  const p = await ctx.newPage();
  await p.goto("/signin", { waitUntil: "networkidle" });
  await p.fill("input[type=email]", ACC[role].email);
  await p.fill("input[type=password]", ACC[role].password);
  await p.click("button[type=submit]");
  await p.waitForURL("**/courses", { timeout: 20000 });
  const s = await ctx.storageState();
  await ctx.close();
  return s;
}
async function settle(p) { await p.waitForLoadState("networkidle").catch(()=>{}); await p.waitForTimeout(900); }

const manifest = [];
async function shot(browser, { name, path, role, vps, full=true, viewportOnly=false, clicks=[] }, state) {
  for (const vpName of vps) {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: VP[vpName], colorScheme:"dark", storageState: state, deviceScaleFactor:1 });
    await guard(ctx);
    const p = await ctx.newPage();
    let finalUrl = path, note = "";
    try {
      await p.goto(path, { waitUntil: "domcontentloaded" });
      await settle(p);
      for (const c of clicks) {
        let done = false;
        for (const sel of c.selectors) {
          try {
            const el = p.locator(sel).first();
            if (await el.count() && await el.isVisible()) { await el.click({ timeout: 3000 }); done = true; break; }
          } catch {}
        }
        if (done) await settle(p); else note += `[click '${c.label}' NOT FOUND] `;
      }
      finalUrl = p.url();
      const file = `${name}--${vpName}.png`;
      await p.screenshot({ path: `${OUT}/${file}`, fullPage: full && !viewportOnly, animations: "disabled" });
      manifest.push({ name, vp: vpName, role, path, finalUrl, file, note, ok: true });
      console.log(`  ✓ ${file}  -> ${finalUrl} ${note}`);
    } catch (e) {
      manifest.push({ name, vp: vpName, role, path, finalUrl, note: note + "ERROR " + e.message.slice(0,120), ok:false });
      console.log(`  ✗ ${name}--${vpName}  ${e.message.slice(0,100)}`);
    }
    await ctx.close();
  }
}

const browser = await chromium.launch();
console.log("signing in…");
const student = await stateFor(browser, "student");
const faculty = await stateFor(browser, "faculty");

const A3 = ["desktop","tablet","mobile"], A2 = ["desktop","mobile"], A1 = ["desktop"];

// ---- ANON ----
console.log("ANON:");
await shot(browser, { name:"anon-landing", path:"/", role:"anon", vps:A2 }, undefined);
await shot(browser, { name:"anon-signin", path:"/signin", role:"anon", vps:A2 }, undefined);

// ---- STUDENT ----
console.log("STUDENT:");
await shot(browser, { name:"stu-home", path:"/courses", role:"student", vps:A3 }, student);
await shot(browser, { name:"stu-home-fold", path:"/courses", role:"student", vps:A1, viewportOnly:true }, student);
await shot(browser, { name:"stu-usermenu", path:"/courses", role:"student", vps:A1, clicks:[{label:"user menu", selectors:["header button:has-text('Test')","header [aria-haspopup]","button:has-text('Test')"]}] }, student);
await shot(browser, { name:"stu-global-ask", path:"/ask", role:"student", vps:A3 }, student);
await shot(browser, { name:"stu-global-ask-fold", path:"/ask", role:"student", vps:A1, viewportOnly:true }, student);
await shot(browser, { name:"stu-global-ask-new", path:"/ask", role:"student", vps:A1, clicks:[{label:"New", selectors:["button:has-text('New')"]}] }, student);
await shot(browser, { name:"stu-global-ask-recent", path:"/ask", role:"student", vps:A1, clicks:[{label:"Recent", selectors:["button:has-text('Recent')"]}] }, student);
await shot(browser, { name:"stu-course-robotics", path:"/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a", role:"student", vps:A2, viewportOnly:false }, student);
await shot(browser, { name:"stu-course-robotics-fold", path:"/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a", role:"student", vps:A1, viewportOnly:true }, student);
await shot(browser, { name:"stu-lectures", path:"/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a/lectures", role:"student", vps:A2 }, student);
await shot(browser, { name:"stu-lecture-chat", path:"/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a/lectures/87a4a143-2f88-40fd-9bc2-8e1bd71c0ce8", role:"student", vps:A3 }, student);
await shot(browser, { name:"stu-assignments", path:"/courses/6a8484f7-be19-4044-b725-8d66efdfaa4a/assignments", role:"student", vps:A2 }, student);
await shot(browser, { name:"stu-subject-ask", path:"/courses/5ab749fb-d4fd-42fc-85ba-b9de82fe1dcf/ask", role:"student", vps:A2 }, student);
await shot(browser, { name:"stu-course-cc101", path:"/courses/fb7c7416-6450-4ad0-8d9e-7e3415e8c975", role:"student", vps:A1 }, student);

// ---- FACULTY ----
console.log("FACULTY:");
await shot(browser, { name:"fac-home", path:"/courses", role:"faculty", vps:A3 }, faculty);
await shot(browser, { name:"fac-home-fold", path:"/courses", role:"faculty", vps:A1, viewportOnly:true }, faculty);
await shot(browser, { name:"fac-create-course", path:"/courses", role:"faculty", vps:A1, clicks:[{label:"create course", selectors:["button:has-text('New course')","button:has-text('Create')","button:has-text('New')","button:has-text('Add course')"]}] }, faculty);
await shot(browser, { name:"fac-course-cc101", path:"/courses/fb7c7416-6450-4ad0-8d9e-7e3415e8c975", role:"faculty", vps:A2 }, faculty);
await shot(browser, { name:"fac-upload", path:"/courses/fb7c7416-6450-4ad0-8d9e-7e3415e8c975", role:"faculty", vps:A1, clicks:[{label:"upload/add lecture", selectors:["button:has-text('Upload')","button:has-text('Add lecture')","button:has-text('New lecture')","button:has-text('Record')","a:has-text('Upload')"]}] }, faculty);
await shot(browser, { name:"fac-lectures", path:"/courses/fb7c7416-6450-4ad0-8d9e-7e3415e8c975/lectures", role:"faculty", vps:A2 }, faculty);
await shot(browser, { name:"fac-lecture-failed", path:"/courses/fb7c7416-6450-4ad0-8d9e-7e3415e8c975/lectures/03f38b9e-9566-47dc-96d5-1cfcc78baf6f", role:"faculty", vps:A1 }, faculty);
await shot(browser, { name:"fac-assignments", path:"/courses/fb7c7416-6450-4ad0-8d9e-7e3415e8c975/assignments", role:"faculty", vps:A1 }, faculty);
await shot(browser, { name:"fac-course-qa", path:"/courses/da572512-6469-4655-be95-78022c936566", role:"faculty", vps:A1 }, faculty);
await shot(browser, { name:"fac-lecture-pending", path:"/courses/da572512-6469-4655-be95-78022c936566/lectures/cde43c95-7c83-48b8-90fa-586d4e7078ea", role:"faculty", vps:A1 }, faculty);
await shot(browser, { name:"fac-global-ask", path:"/ask", role:"faculty", vps:A1 }, faculty);

await browser.close();
writeFileSync(`${OUT}/_manifest.json`, JSON.stringify({ capturedRoutes: manifest, blockedPaidRequests: blocked }, null, 2));
console.log(`\nDONE. ${manifest.length} captures, ${blocked.length} paid requests blocked. -> ${OUT}`);
