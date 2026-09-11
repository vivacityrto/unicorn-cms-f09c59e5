import { defineConfig, devices } from "@playwright/test";

// Packet P2-QA -- qa:e2e. A deliberately separate config file from
// playwright.config.ts (which always targets PRODUCTION), never merged into
// it, so a QA run can never be silently pointed at production or vice versa.
//
// src/integrations/supabase/client.ts is a Lovable-generated file. As of the
// env-driven QA client change, it reads
// import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY at
// runtime, falling back to the hardcoded production values only when those
// env vars are absent -- so a QA run no longer requires hand-editing and
// reverting client.ts. Point `npm run dev` at unicorn-qa by setting both env
// vars before starting it (matching the convention already used by
// scripts/qa-seed-e2e-personas.mjs and the qa:rls/qa:contract/etc. GitHub
// Actions workflows):
//   VITE_SUPABASE_URL=https://qfpxvumcrnzrjyvqkicq.supabase.co \
//   VITE_SUPABASE_PUBLISHABLE_KEY=<unicorn-qa anon key> \
//   npm run dev
// Never commit a `.env`/`.env.local` with these QA values checked in as the
// active values for a normal dev session -- set them inline or in a
// gitignored local file for the duration of a QA run only. A Lovable remix
// may overwrite client.ts back to hardcoded-only literals; if so, reapply
// the env-var read (see client.ts's own header comment) before relying on
// this again.
//
// Personas: a persistent Super Admin and a persistent client, seeded once
// via `node scripts/qa-seed-e2e-personas.mjs` (see
// .github/workflows/qa-seed-e2e-personas.yml) into a persistent
// "qa-e2e-demo-tenant" -- unlike every other P2-QA suite's fixtures, these
// are NOT ephemeral/per-run, specifically so this suite has something real
// to log into and render without needing a browser-driven seed step first.
// Storage states generated the same way as production's:
// `E2E_EMAIL=... E2E_PASSWORD=... node e2e/auth-setup.mjs qa-superadmin` /
// `qa-client` (requires `npm run dev` already running against the
// QA-pointed environment above).
export default defineConfig({
  testDir: "./e2e/qa",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  timeout: 45_000,
  expect: {
    // Higher than playwright.config.ts's 15_000: the QA dashboard fires
    // roughly 50 sequential Supabase calls on first load (many more
    // waterfall-style round trips than production's warmer/cached state --
    // confirmed via a network-logging diagnostic run), so a cold-route
    // first hit genuinely needs more headroom, not just a flakier retry.
    timeout: 25_000,
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
      name: "qa-superadmin",
      testMatch: /superadmin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/qa-superadmin.json" },
    },
    {
      name: "qa-client",
      testMatch: /client\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/qa-client.json" },
    },
  ],
});
