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

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
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
      testMatch: /personas\/superadmin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/superadmin.json" },
    },
    {
      name: "persona-client-demo",
      testMatch: /personas\/client-demo\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/client-demo.json" },
    },
  ],
});
