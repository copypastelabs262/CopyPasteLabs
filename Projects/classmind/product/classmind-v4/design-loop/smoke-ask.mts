// ONE-OFF SMOKE: drive the Ask tab's real conversation flow in degraded mode.
//
// Free by construction: this tree has no GEMINI_API_KEY, so /ask answers from
// retrieval alone (degraded) or with the empty-course state. The point is to
// SEE the dynamic states the static capture cannot: a submitted question, the
// waiting state, the rendered turn, the composer disabled/enabled cycle.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf8"));
const BASE = config.baseUrl;
const OUT = new URL("./runs/2026-09-02-shell/smoke-ask/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const page = await context.newPage();

// Sign in as the student through the real UI.
await page.goto(`${BASE}/signin`);
await page.fill("input[type=email]", config.accounts.student.email);
await page.fill("input[type=password]", config.accounts.student.password);
await page.click("button[type=submit]");
await page.waitForURL("**/courses", { timeout: 20000 });

// The Ask tab of the QA course.
await page.goto(`${BASE}/courses/fb7c7416-6450-4ad0-8d9e-7e3415e8c975/ask`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}1-intro.png`, fullPage: true });

// Ask through a suggestion chip, then watch the turn resolve.
await page.click("text=What assignment was given?");
await page.screenshot({ path: `${OUT}2-asking.png`, fullPage: true });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}3-answered.png`, fullPage: true });

// A second, typed question — the conversation accumulates.
await page.fill("input[placeholder='Ask anything about this class']", "What topics were covered?");
await page.click("button:has-text('Ask')");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}4-two-turns.png`, fullPage: true });

console.log("smoke-ask done →", OUT);
await browser.close();
