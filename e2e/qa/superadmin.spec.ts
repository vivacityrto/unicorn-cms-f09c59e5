import { test, expect } from "@playwright/test";

// Packet P2-QA -- qa:e2e, Super Admin persona against unicorn-qa (not
// production; see playwright.qa.config.ts). Storage state:
// playwright/.auth/qa-superadmin.json, for the persistent
// qa-e2e-superadmin@example.qa persona (scripts/qa-seed-e2e-personas.mjs).
// Read-only: navigation + assertions only, no sign-out.

test("Dashboard loads as an authenticated SuperAdmin", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const response = await page.goto("/dashboard");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("A representative SuperAdmin-only route is reachable, not redirected to /dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/settings/roles");
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page).not.toHaveURL("**/dashboard");
  expect(errors).toEqual([]);
});
