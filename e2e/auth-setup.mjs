#!/usr/bin/env node
// Generates a Playwright storage-state file for one authenticated persona by
// actually logging in through the real UI once. Never commit the output
// (playwright/.auth/** is gitignored) and never hardcode credentials here --
// they come from environment variables set for this invocation only.
//
// Usage:
//   E2E_EMAIL=... E2E_PASSWORD=... node e2e/auth-setup.mjs <persona-name>
//
// <persona-name> becomes playwright/.auth/<persona-name>.json, which
// playwright.config.ts's persona-* projects load as storageState. Requires
// the dev server already running on http://localhost:8080 (run `npm run
// dev` in another terminal first) -- this script does not manage the
// server's lifecycle itself, unlike the test projects.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const persona = process.argv[2];
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!persona || !email || !password) {
  console.error("Usage: E2E_EMAIL=... E2E_PASSWORD=... node e2e/auth-setup.mjs <persona-name>");
  process.exit(1);
}

const outDir = join(process.cwd(), "playwright", ".auth");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${persona}.json`);

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:8080/login");
  await page.getByPlaceholder("Enter your email address").first().fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();

  // Successful login navigates away from /login; give it a generous window
  // since the first request after a cold dev-server start can be slow.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });

  await context.storageState({ path: outFile });
  await browser.close();

  console.log(`Wrote ${outFile} (persona: ${persona}, landed on ${new URL(page.url()).pathname})`);
}

main().catch((err) => {
  console.error("auth-setup failed:", err.message);
  process.exit(1);
});
