// Phase 3 functional walkthrough of the chat workspace. Uses ONLY pinned $0
// direct-route questions, and asserts every /api/ask response has usage:null
// (no Gemini spend). Cleans up the created thread via the owner-guarded DELETE.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3500";
const OUT = "C:/Users/Shyam Chavda/.claude/jobs/adfc0096/tmp/phase3-shots";
mkdirSync(OUT, { recursive: true });

const askResponses = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
ctx.on("response", async (res) => {
  const req = res.request();
  if (req.method() === "POST" && /\/api\/ask(\?|$)/.test(req.url())) {
    let usage = "?"; try { usage = (await res.json())?.usage ?? null; } catch {}
    askResponses.push({ status: res.status(), usage });
  }
});
const p = await ctx.newPage();
const shot = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true, animations: "disabled" }); console.log("  shot " + n); };
const turnCount = () => p.locator("ol > li").count();

await p.goto("/signin", { waitUntil: "networkidle" });
await p.fill("input[type=email]", "student.test@classmind.local");
await p.fill("input[type=password]", "ClassMindTest!2026");
await p.click("button[type=submit]");
await p.waitForURL("**/courses", { timeout: 20000 });

// 1. Open Ask -> should be a NEW (empty) chat, not auto-resumed.
await p.goto("/ask", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const urlOnOpen = p.url();
const emptyTurns = await turnCount();
await shot("p3-1-empty");

// 2. Ask a $0 direct question.
await p.fill("#ask-input, input[placeholder*='Ask']", "What assignments do I have?").catch(async () => {
  await p.locator("form input").last().fill("What assignments do I have?");
});
await p.locator("form button[type=submit]").last().click();
await p.waitForFunction(() => document.querySelectorAll("ol > li").length >= 1, { timeout: 20000 });
await p.waitForTimeout(1500);
const afterAsk1Turns = await turnCount();
const urlAfterAsk = p.url();
const cid = new URL(urlAfterAsk).searchParams.get("c");
const answer1HasAssignment = (await p.locator("body").innerText()).toLowerCase().includes("assignment");
await shot("p3-2-answer");

// 3. Follow-up (multi-turn), $0 direct.
await p.locator("form input").last().fill("Who has to do it?");
await p.locator("form button[type=submit]").last().click();
await p.waitForFunction(() => document.querySelectorAll("ol > li").length >= 2, { timeout: 20000 });
await p.waitForTimeout(1500);
const afterFollowupTurns = await turnCount();
const bodyText = await p.locator("body").innerText();
const followupUsedContext = /Shyam|Shiv|Darshan|for:/i.test(bodyText); // the audience answer
await shot("p3-3-followup");

// 4. Reload -> conversation persists.
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const afterReloadTurns = await turnCount();
const urlAfterReload = p.url();

// 5. Sidebar shows the thread; New chat clears it.
const sidebarHasThread = await p.locator("nav[aria-label='Your conversations'] a").count();
await p.locator("button:has-text('New chat')").first().click();
await p.waitForTimeout(1200);
const afterNewChatTurns = await turnCount();
const urlAfterNew = p.url();
await shot("p3-4-newchat");

// 6. Click the thread in the sidebar -> resumes.
await p.locator("nav[aria-label='Your conversations'] a").first().click();
await p.waitForTimeout(1500);
const afterResumeTurns = await turnCount();
await shot("p3-5-resumed");

// Cleanup: delete the thread we created (owner-guarded DELETE, from the page's session).
let deleted = "skipped";
if (cid) {
  deleted = await p.evaluate(async (id) => {
    const r = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    return r.status;
  }, cid);
}

console.log("\n=== RESULTS ===");
console.log("open /ask URL          :", urlOnOpen, "(expect no ?c=)");
console.log("empty turns on open    :", emptyTurns, "(expect 0)");
console.log("turns after ask #1     :", afterAsk1Turns, "(expect 1)");
console.log("conversation id (?c=)  :", cid, "(expect a uuid)");
console.log("answer #1 mentions assignment:", answer1HasAssignment);
console.log("turns after follow-up  :", afterFollowupTurns, "(expect 2)");
console.log("follow-up used context :", followupUsedContext, "(expect true - audience answer)");
console.log("turns after reload     :", afterReloadTurns, "(expect 2 - persisted)");
console.log("url after reload has c=:", new URL(urlAfterReload).searchParams.get("c") === cid);
console.log("sidebar thread count   :", sidebarHasThread, "(expect >=1)");
console.log("turns after New chat   :", afterNewChatTurns, "(expect 0)");
console.log("url after New chat     :", urlAfterNew, "(expect no ?c=)");
console.log("turns after resume     :", afterResumeTurns, "(expect 2)");
console.log("ask responses usage    :", JSON.stringify(askResponses), "(all usage:null = $0, no Gemini)");
console.log("cleanup DELETE status  :", deleted, "(expect 200)");

await browser.close();
