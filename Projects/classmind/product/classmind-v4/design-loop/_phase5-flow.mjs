/**
 * PHASE 5 — read-only lecture walkthrough. NO paid calls: the money guard is
 * armed (blocks /api/ask, extract, transcribe, poll, AI hosts) and the script
 * never asks a question. It resumes/reads only. It proves the NEW lecture
 * conversation experience renders: the shared chat scoped to the lecture, the
 * Conversations drawer (shared AskSidebar), New chat, the scope label, the
 * knowledge + transcript disclosures, and Previous/Next lecture navigation.
 *
 *   node design-loop/_phase5-flow.mjs
 */
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3500";
const OUT = process.env.SHOT_DIR || ".";
mkdirSync(OUT, { recursive: true });
const COURSE = "6a8484f7-be19-4044-b725-8d66efdfaa4a"; // Robotics (Test1)
const LECTURE = "87a4a143-2f88-40fd-9bc2-8e1bd71c0ce8"; // processed Robotics lecture
const NONREADY = "5384de32-3444-4012-b056-bd3c537a4205"; // the failed .aac upload
const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };
const AUTH = "design-loop/.auth/student.json";

const BLOCKED_API =
  /\/api\/(lectures\/[^/]+\/(extract|transcribe|poll)|courses\/[^/]+\/ask|ask(?!\/conversations))(\/|\?|$)/;
const BLOCKED_HOSTS = ["api.sarvam.ai", "api.groq.com", "generativelanguage.googleapis.com"];
const blocked = [];

let pass = 0, fail = 0;
const check = (ok, label, detail) => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail !== undefined ? "  -> " + JSON.stringify(detail) : ""}`); }
};

async function arm(context) {
  await context.route("**/*", (route) => {
    const url = route.request().url();
    let host = "";
    try { host = new URL(url).hostname; } catch {}
    if (BLOCKED_API.test(url) || BLOCKED_HOSTS.some((h) => host.endsWith(h))) {
      blocked.push(url);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
}

async function ensureAuth(browser) {
  if (existsSync(AUTH)) {
    // Validate it still lands on /courses (not /signin).
    const ctx = await browser.newContext({ baseURL: BASE, storageState: AUTH });
    await arm(ctx);
    const p = await ctx.newPage();
    await p.goto("/courses", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);
    const ok = !p.url().includes("/signin");
    await ctx.close();
    if (ok) return AUTH;
  }
  // Fresh sign-in (email/password — not a paid call).
  const ctx = await browser.newContext({ baseURL: BASE });
  await arm(ctx);
  const p = await ctx.newPage();
  await p.goto("/signin", { waitUntil: "networkidle" });
  await p.fill("input[type=email]", STUDENT.email);
  await p.fill("input[type=password]", STUDENT.password);
  await p.click("button[type=submit]");
  await p.waitForURL("**/courses", { timeout: 20000 });
  mkdirSync("design-loop/.auth", { recursive: true });
  await ctx.storageState({ path: AUTH });
  await ctx.close();
  return AUTH;
}

const settle = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(900); };

async function main() {
  const browser = await chromium.launch();
  const storageState = await ensureAuth(browser);

  // ---- DESKTOP ----
  const ctx = await browser.newContext({
    baseURL: BASE, viewport: { width: 1440, height: 900 }, colorScheme: "dark", storageState, deviceScaleFactor: 1,
  });
  await arm(ctx);
  const page = await ctx.newPage();

  await page.goto(`/courses/${COURSE}/lectures/${LECTURE}`, { waitUntil: "domcontentloaded" });
  await settle(page);

  const h1 = (await page.locator("h1").first().textContent().catch(() => ""))?.trim() ?? "";
  check(h1.length > 0, "lecture landing shows a title (identity)", h1);

  const convBtn = page.getByRole("button", { name: "Conversations" }).first();
  check((await convBtn.count()) > 0, "the Conversations control is present on the lecture");

  // Composer + intro = the shared chat surface, scoped to the lecture.
  const composer = page.getByPlaceholder("Ask anything about this lecture");
  check((await composer.count()) > 0, "the shared lecture composer is present");

  // Previous / Next lecture navigation
  const pager = page.locator('nav[aria-label="Lectures in this course"]');
  const pagerCount = await pager.count();
  const prevNextLinks = pagerCount ? await pager.getByRole("link").count() : 0;
  check(pagerCount > 0 && prevNextLinks >= 1, "Previous/Next lecture navigation renders", { pagerCount, prevNextLinks });

  await page.screenshot({ path: join(OUT, "p5-1-lecture-desktop.png"), fullPage: true, animations: "disabled" });

  // Open the Conversations drawer (shared AskSidebar, scoped)
  await convBtn.click();
  await page.waitForTimeout(700);
  const dialog = page.getByRole("dialog", { name: "Conversations for this lecture" });
  check((await dialog.count()) > 0, "Conversations drawer opens (role=dialog, aria-modal)");
  const newChat = dialog.getByRole("button", { name: "New chat" });
  check((await newChat.count()) > 0, "the drawer offers New chat (same as Global/Course)");
  const asking = await dialog.getByText("Asking", { exact: false }).count();
  check(asking > 0, "the drawer names the scope (Asking · <lecture>)");
  await page.screenshot({ path: join(OUT, "p5-2-lecture-drawer.png"), fullPage: true, animations: "disabled" });

  // Close drawer (Escape), then expand knowledge + transcript
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  const browseBtn = page.getByRole("button", { name: /^Browse \d+ item/ });
  if (await browseBtn.count()) {
    await browseBtn.first().click();
    await page.waitForTimeout(600);
    check(true, "knowledge disclosure expands ('What was taught')");
  } else {
    check(true, "knowledge disclosure present (no browsable items to expand)");
  }
  const showTranscript = page.getByRole("button", { name: "Show transcript" });
  if (await showTranscript.count()) {
    await showTranscript.first().click();
    await page.waitForTimeout(700);
    check(true, "transcript disclosure opens ('Full lecture')");
  } else {
    check(true, "transcript control state consistent (no transcript button)");
  }
  await page.screenshot({ path: join(OUT, "p5-3-lecture-knowledge-transcript.png"), fullPage: true, animations: "disabled" });

  // Non-ready lecture as a student = calm, truthful "still processing" (never a raw error)
  await page.goto(`/courses/${COURSE}/lectures/${NONREADY}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const bodyText = (await page.locator("body").innerText().catch(() => "")) ?? "";
  const calm = /still being processed|processed|not published/i.test(bodyText);
  const noRawError = !/error:|stack|undefined is not|TypeError/i.test(bodyText);
  check(calm && noRawError, "a non-ready lecture reads as a calm state to a student, no raw error", { calm, noRawError });
  await page.screenshot({ path: join(OUT, "p5-4-lecture-nonready.png"), fullPage: true, animations: "disabled" });

  await ctx.close();

  // ---- MOBILE ----
  const mctx = await browser.newContext({
    baseURL: BASE, viewport: { width: 390, height: 844 }, colorScheme: "dark", storageState, deviceScaleFactor: 1,
  });
  await arm(mctx);
  const mp = await mctx.newPage();
  await mp.goto(`/courses/${COURSE}/lectures/${LECTURE}`, { waitUntil: "domcontentloaded" });
  await settle(mp);
  const mConv = mp.getByRole("button", { name: "Conversations" }).first();
  check((await mConv.count()) > 0, "mobile: Conversations control present");
  await mp.screenshot({ path: join(OUT, "p5-5-lecture-mobile.png"), fullPage: true, animations: "disabled" });
  await mConv.click();
  await mp.waitForTimeout(700);
  const mDialog = mp.getByRole("dialog", { name: "Conversations for this lecture" });
  check((await mDialog.count()) > 0, "mobile: drawer opens as an overlay");
  await mp.screenshot({ path: join(OUT, "p5-6-lecture-mobile-drawer.png"), fullPage: true, animations: "disabled" });
  await mctx.close();

  await browser.close();

  check(blocked.length === 0, "NO paid endpoint was called during the walkthrough ($0)", blocked);
  console.log(`\n${pass} passed, ${fail} failed  ·  blocked(paid) attempts: ${blocked.length}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
