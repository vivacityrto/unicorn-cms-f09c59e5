import { test, expect } from "@playwright/test";
import { startSupabaseWaterfall } from "./supabase-waterfall";

// Packet P2-QA -- qa:e2e, Super Admin persona against unicorn-qa (not
// production; see playwright.qa.config.ts). Storage state:
// playwright/.auth/qa-superadmin.json, for the persistent
// qa-e2e-superadmin@example.qa persona (scripts/qa-seed-e2e-personas.mjs).
// Read-only: navigation + assertions only, no sign-out.

test("Dashboard loads as an authenticated SuperAdmin", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const finishWaterfall = startSupabaseWaterfall(page, "qa-superadmin /dashboard");

  const response = await page.goto("/dashboard");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
  await finishWaterfall();
});

test("SuperAdmin reads the representative tenant address surface", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const finishWaterfall = startSupabaseWaterfall(page, "qa-superadmin /tenant/54 address-read");

  // Tenant 54 is the deterministic representative tenant from the approved
  // TOM QA fixture. This is a read-only assertion; no address form or action
  // control is opened.
  const response = await page.goto("/tenant/54?tab=overview");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Addresses" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("TOM QA Run 20260913 HQ", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await finishWaterfall();
});

test("A representative SuperAdmin-only route is reachable, not redirected to /dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const finishWaterfall = startSupabaseWaterfall(page, "qa-superadmin /settings/roles");

  await page.goto("/settings/roles");
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page).not.toHaveURL("**/dashboard");
  expect(errors).toEqual([]);
  await finishWaterfall();
});
