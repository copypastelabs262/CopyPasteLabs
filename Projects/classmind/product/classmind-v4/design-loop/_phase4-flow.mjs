// Phase 4 functional + adversarial walkthrough of Course Ask. Pinned $0 direct
// questions only (asserts usage:null on every ask). Verifies course scope in the
// sources, server-side access control (a non-enrolled course 403s), and that
// Global Ask still spans subjects. Cleans up created threads.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3500";
const OUT = "C:/Users/Shyam Chavda/.claude/jobs/adfc0096/tmp/phase4-shots";
mkdirSync(OUT, { recursive: true });
const ROBOTICS = "6a8484f7-be19-4044-b725-8d66efdfaa4a"; // student IS enrolled
const DBVC = "dd4385e0"; // Test3 — student is NOT enrolled (adversarial target)

const askResponses = [];
const b = await chromium.launch();
const ctx = await b.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
ctx.on("response", async (res) => {
  const req = res.request();
  if (req.method() === "POST" && /\/api\/(ask|courses\/[^/]+\/ask)(\?|$)/.test(req.url())) {
    let j = {}; try { j = await res.json(); } catch {}
    askResponses.push({ url: req.url().replace(BASE, ""), status: res.status(), usage: j?.usage ?? null, sourceCourses: [...new Set((j?.sources ?? []).map((s) => s.courseId))] });
  }
});
const p = await ctx.newPage();
const shot = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true, animations: "disabled" }); };
const turns = () => p.locator("ol > li").count();
const composerFill = async (t) => p.locator("form input").last().fill(t);
const send = async () => p.locator("form button[type=submit]").last().click();

await p.goto("/signin", { waitUntil: "networkidle" });
await p.fill("input[type=email]", "student.test@classmind.local");
await p.fill("input[type=password]", "ClassMindTest!2026");
await p.click("button[type=submit]");
await p.waitForURL("**/courses", { timeout: 20000 });

// --- Enter the course from My Classes ---
await p.goto("/classes", { waitUntil: "networkidle" }); await p.waitForTimeout(700);
await p.locator(`a[href="/courses/${ROBOTICS}"]`).first().click();
await p.waitForURL(`**/courses/${ROBOTICS}`, { timeout: 20000 }); await p.waitForTimeout(1200);
const landedOnCourseAsk = (await p.locator("body").innerText()).toLowerCase().includes("ask this class");
const emptyTurns = await turns();
await shot("p4-1-course-empty");

// --- Ask a $0 course question ---
await composerFill("What assignment was given?"); await send();
await p.waitForFunction(() => document.querySelectorAll("ol > li").length >= 1, { timeout: 20000 }); await p.waitForTimeout(1200);
const cid = new URL(p.url()).searchParams.get("c");
const t1 = await turns();
await shot("p4-2-course-answer");

// --- Follow-up (multi-turn), $0 ---
await composerFill("Who has to do it?"); await send();
await p.waitForFunction(() => document.querySelectorAll("ol > li").length >= 2, { timeout: 20000 }); await p.waitForTimeout(1200);
const t2 = await turns();
const followupContext = /Shyam|Shiv|Darshan|for:/i.test(await p.locator("body").innerText());

// --- Reload persists ---
await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(1200);
const tReload = await turns();

// --- Sidebar shows the course thread ---
const sidebarCount = await p.locator("nav[aria-label='Your conversations'] a").count();

// --- ADVERSARIAL: access a course the student is NOT in (direct API) ---
const dbvcAsk = await p.evaluate(async (id) => (await fetch(`/api/courses/${id}/ask?q=hi`)).status, DBVC);
const dbvcConvos = await p.evaluate(async (id) => (await fetch(`/api/courses/${id}/conversations`)).status, DBVC);
// Direct navigation to the non-enrolled course -> the shell shows an error, not content.
await p.goto(`/courses/${DBVC}`, { waitUntil: "networkidle" }); await p.waitForTimeout(1200);
const dbvcBody = (await p.locator("body").innerText());
const dbvcBlocked = /could not be loaded|not found|no access|forbidden/i.test(dbvcBody);
const dbvcLeakedTitle = /DBVC|G\.711/i.test(dbvcBody);
await shot("p4-3-adversarial");

// --- Global Ask still global ---
await p.goto("/ask", { waitUntil: "networkidle" }); await p.waitForTimeout(900);
await composerFill("What assignments do I have?"); await send();
await p.waitForFunction(() => document.querySelectorAll("ol > li").length >= 1, { timeout: 20000 }); await p.waitForTimeout(1200);
const gcid = new URL(p.url()).searchParams.get("c");

// --- Cleanup ---
const del = async (id) => id ? p.evaluate(async (i) => (await fetch(`/api/conversations/${i}`, { method: "DELETE" })).status, id) : "skip";
const delCourse = await del(cid);
const delGlobal = await del(gcid);

const courseAsk = askResponses.filter((r) => r.url.includes("/courses/"));
const globalAsk = askResponses.filter((r) => !r.url.includes("/courses/"));
console.log("\n=== PHASE 4 RESULTS ===");
console.log("landed on Course Ask       :", landedOnCourseAsk, "(expect true)");
console.log("course empty turns         :", emptyTurns, "(expect 0)");
console.log("course turns after ask     :", t1, "(expect 1)");
console.log("course turns after followup:", t2, "(expect 2)");
console.log("followup used context      :", followupContext, "(expect true)");
console.log("course turns after reload  :", tReload, "(expect 2 - persisted)");
console.log("course sidebar thread count:", sidebarCount, "(expect >=1)");
console.log("course ask source courses  :", JSON.stringify(courseAsk.map((r) => r.sourceCourses)), "(expect ONLY " + ROBOTICS.slice(0,8) + ")");
console.log("ADVERSARIAL /courses/DBVC/ask        :", dbvcAsk, "(expect 403 or 404)");
console.log("ADVERSARIAL /courses/DBVC/conversations:", dbvcConvos, "(expect 403 or 404)");
console.log("ADVERSARIAL direct nav blocked       :", dbvcBlocked, "leaked title:", dbvcLeakedTitle, "(expect blocked=true, leaked=false)");
console.log("global ask source courses  :", JSON.stringify(globalAsk.map((r) => r.sourceCourses)), "(expect >=2 courses)");
console.log("ALL ask usage (=$0)        :", JSON.stringify(askResponses.map((r) => r.usage)), "(all null)");
console.log("cleanup deletes            :", delCourse, delGlobal, "(expect 200 200)");

await b.close();
