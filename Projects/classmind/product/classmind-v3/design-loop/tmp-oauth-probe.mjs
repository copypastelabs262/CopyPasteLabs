// One-off diagnostic: click "Continue with Google" on the local V3 sign-in
// page and capture the Supabase authorize URL the browser is sent to — then
// ABORT it, so no request ever reaches Google and no sign-in happens. The
// point is to see, verbatim, what redirect_to V3 asks Supabase for.
import { chromium } from "playwright";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

let authorizeUrl = null;
await context.route("**/*", (route) => {
  const u = route.request().url();
  if (u.includes("/auth/v1/authorize")) {
    authorizeUrl = u;
    return route.abort("blockedbyclient");
  }
  if (/accounts\.google\.com/.test(u)) return route.abort("blockedbyclient");
  return route.continue();
});

await page.goto("http://localhost:3400/signin", { waitUntil: "networkidle" });
await page.click("text=Continue with Google");
await page.waitForTimeout(2000);

if (!authorizeUrl) {
  console.log("NO authorize request observed");
} else {
  const u = new URL(authorizeUrl);
  console.log("authorize host :", u.origin + u.pathname);
  console.log("provider       :", u.searchParams.get("provider"));
  console.log("redirect_to    :", u.searchParams.get("redirect_to"));
}
await browser.close();
