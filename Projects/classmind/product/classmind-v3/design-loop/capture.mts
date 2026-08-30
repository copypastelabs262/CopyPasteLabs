/**
 * Design Master Loop — render capture.
 *
 * Drives the REAL running app with Playwright and captures full-page
 * screenshots per target × viewport, so design decisions are made against
 * rendered pixels rather than source code.
 *
 *   node --env-file=.env.local design-loop/capture.mts --run <runId> --label before
 *
 * Flags:
 *   --run <id>        run directory under design-loop/runs/   (default: date)
 *   --label <name>    iteration label, e.g. before | iter-1 | after (default: timestamp)
 *   --target <name>   capture only this target from config.json (repeatable)
 *   --scheme <s>      light | dark  (default: config.colorScheme)
 *   --base-url <url>  override config.baseUrl
 *
 * MONEY GUARD — non-negotiable, see root CLAUDE.md "Spending the operator's
 * money". Rendering pages must never trigger a paid call. Every browser
 * context aborts, at the network layer, any request to:
 *   - /api/lectures/:id/extract | transcribe | poll   (reasoning / ASR paths)
 *   - /api/courses/:id/ask                            (reasoning path)
 *   - any external AI-provider host
 * Blocked attempts are recorded in the manifest so a screen that tries to
 * spend money is itself a design finding, never a bill.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOOP_DIR = dirname(fileURLToPath(import.meta.url));

interface Viewport {
  width: number;
  height: number;
}

interface Target {
  name: string;
  path: string;
  role: "anon" | "student" | "faculty";
  /** After loading `path`, click the first element matching this selector and
   *  capture where it lands. Lets a target follow real data (e.g. "the first
   *  course this account can see") without hardcoding ids. */
  clickFirst?: string;
}

interface Config {
  baseUrl: string;
  colorScheme: "light" | "dark";
  viewports: Record<string, Viewport>;
  accounts: Record<string, { email: string; password: string }>;
  targets: Target[];
}

/* ------------------------------------------------------------------------- */
/* The guard                                                                  */
/* ------------------------------------------------------------------------- */

const BLOCKED_API =
  /\/api\/(lectures\/[^/]+\/(extract|transcribe|poll)|courses\/[^/]+\/ask)(\/|\?|$)/;

const BLOCKED_HOSTS = [
  "api.sarvam.ai",
  "api.groq.com",
  "generativelanguage.googleapis.com",
  "api.openai.com",
  "api.mistral.ai",
  "api.sambanova.ai",
];

const blockedAttempts: { url: string; page: string; at: string }[] = [];

async function armMoneyGuard(context: BrowserContext) {
  await context.route("**/*", (route) => {
    const url = route.request().url();
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      /* non-URL schemes fall through to continue */
    }
    if (BLOCKED_API.test(url) || BLOCKED_HOSTS.some((h) => host.endsWith(h))) {
      blockedAttempts.push({
        url,
        page: route.request().frame()?.url() ?? "?",
        at: new Date().toISOString(),
      });
      console.error(`  [BLOCKED] ${url}`);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
}

/* ------------------------------------------------------------------------- */
/* CLI + config                                                               */
/* ------------------------------------------------------------------------- */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function argAll(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

const config: Config = JSON.parse(readFileSync(join(LOOP_DIR, "config.json"), "utf8"));

const baseUrl = arg("base-url") ?? config.baseUrl;
const scheme = (arg("scheme") ?? config.colorScheme) as "light" | "dark";
const runId = arg("run") ?? new Date().toISOString().slice(0, 10);
const label = arg("label") ?? new Date().toISOString().replace(/[:.]/g, "-");
const only = argAll("target");

const runDir = resolve(LOOP_DIR, "runs", runId, label);
const authDir = resolve(LOOP_DIR, ".auth");
mkdirSync(runDir, { recursive: true });
mkdirSync(authDir, { recursive: true });

/* ------------------------------------------------------------------------- */
/* Auth                                                                       */
/* ------------------------------------------------------------------------- */

const AUTH_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function storageStateFor(browser: Browser, role: string): Promise<string | undefined> {
  if (role === "anon") return undefined;
  const account = config.accounts[role];
  if (!account) throw new Error(`No account configured for role "${role}"`);

  const statePath = join(authDir, `${role}.json`);
  if (existsSync(statePath) && Date.now() - statSync(statePath).mtimeMs < AUTH_MAX_AGE_MS) {
    return statePath;
  }

  console.log(`  signing in as ${role} (${account.email})…`);
  const context = await browser.newContext({ baseURL: baseUrl });
  await armMoneyGuard(context);
  const page = await context.newPage();
  await page.goto("/signin", { waitUntil: "networkidle" });
  await page.fill("input[type=email]", account.email);
  await page.fill("input[type=password]", account.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/courses", { timeout: 20_000 });
  await context.storageState({ path: statePath });
  await context.close();
  return statePath;
}

/* ------------------------------------------------------------------------- */
/* Capture                                                                    */
/* ------------------------------------------------------------------------- */

async function settle(page: Page) {
  // networkidle catches data fetches; the extra beat lets entry animations and
  // font paints finish so two captures of the same state hash the same.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
}

async function main() {
  const browser = await chromium.launch();
  const manifest: {
    baseUrl: string;
    scheme: string;
    capturedAt: string;
    shots: { target: string; viewport: string; file: string; finalUrl: string }[];
    blocked: typeof blockedAttempts;
  } = { baseUrl, scheme, capturedAt: new Date().toISOString(), shots: [], blocked: blockedAttempts };

  const targets = config.targets.filter((t) => only.length === 0 || only.includes(t.name));
  if (targets.length === 0) {
    console.error(`No targets matched ${only.join(", ")}`);
    process.exit(1);
  }

  // Auth once per role, reused across viewports.
  const states = new Map<string, string | undefined>();
  for (const role of new Set(targets.map((t) => t.role))) {
    states.set(role, await storageStateFor(browser, role));
  }

  for (const target of targets) {
    for (const [viewportName, viewport] of Object.entries(config.viewports)) {
      const context = await browser.newContext({
        baseURL: baseUrl,
        viewport,
        colorScheme: scheme,
        storageState: states.get(target.role),
        deviceScaleFactor: 1,
      });
      await armMoneyGuard(context);
      const page = await context.newPage();

      await page.goto(target.path, { waitUntil: "domcontentloaded" });
      await settle(page);

      if (target.clickFirst) {
        const el = page.locator(target.clickFirst).first();
        if ((await el.count()) === 0) {
          console.warn(`  [skip] ${target.name}: nothing matches ${target.clickFirst}`);
          await context.close();
          continue;
        }
        await el.click();
        await settle(page);
      }

      const file = `${target.name}--${viewportName}--${scheme}.png`;
      // animations:"disabled" fast-forwards CSS animations to their end state,
      // so an entry animation mid-flight can never masquerade as a contrast bug.
      await page.screenshot({ path: join(runDir, file), fullPage: true, animations: "disabled" });
      manifest.shots.push({
        target: target.name,
        viewport: viewportName,
        file,
        finalUrl: page.url(),
      });
      console.log(`  ✓ ${file}  (${page.url()})`);
      await context.close();
    }
  }

  await browser.close();
  writeFileSync(join(runDir, `manifest--${scheme}.json`), JSON.stringify(manifest, null, 2));

  if (blockedAttempts.length > 0) {
    console.error(
      `\n${blockedAttempts.length} request(s) to paid endpoints were BLOCKED during capture.` +
        `\nThat is a design finding — a screen tried to spend money on render. See the manifest.`,
    );
  }
  console.log(`\nCaptured ${manifest.shots.length} shots → ${runDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
