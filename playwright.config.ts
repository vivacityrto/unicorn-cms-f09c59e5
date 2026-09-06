import { defineConfig, devices } from "@playwright/test";

// Playwright harness (P0.7/P0.8, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// The local frontend talks to hosted PRODUCTION Supabase, not a local
// backend -- so even an unauthenticated run against localhost is production
// data access. Default posture is read-only: nothing here writes data.
// Authenticated runs use a storage state generated once via
// `npm run e2e:auth-setup` (reads credentials from env vars, never commits
// them) rather than logging in inside every test.
//
// `reuseExistingServer: false` and `strictPort: true` are deliberate: this
// must be the dev server this worktree/branch just started, not some other
// worktree's server left running on 8080 (AGENTS.md -> "Local dev server
// troubleshooting" / "Auth / testing gotcha" -- shared Edge CORS only
// allows localhost:8080, so a silently-reassigned port would also break
// every Edge-calling journey in a confusing way).
//
// Because of that same reuseExistingServer:false policy, every run pays for
// a genuinely cold Vite dev server: whichever route a test hits first still
// needs an on-demand esbuild transform of that route's module graph, which
// routinely takes longer than Playwright's 5s default assertion timeout --
// confirmed empirically (2026-09-02/03): re-running the exact same suite
// immediately afterward, with no code change, reliably went from 1-2 random
// failures on unrelated pages to a clean pass, because the second run hit
// an already-warm transform cache. `retries: 1` automates the workaround
// that was otherwise being done by hand (re-running the whole suite);
// `expect.timeout: 15_000` gives the first hit of a cold route enough room
// to transform without needing a retry at all. Neither masks a real
// regression: an actual bug fails consistently on the retry too, since the
// route is warm by then.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: false,
    strictPort: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "unauth-desktop",
      testMatch: /unauth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "unauth-mobile",
      testMatch: /unauth\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "persona-superadmin",
      testMatch: /personas\/(?:superadmin|operations)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/superadmin.json" },
    },
    {
      name: "persona-client-demo",
      testMatch: /personas\/client-demo\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/client-demo.json" },
    },
  ],
});
