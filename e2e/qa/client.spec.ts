import { test, expect } from "@playwright/test";

// Packet P2-QA -- qa:e2e, client persona against unicorn-qa (not production;
// see playwright.qa.config.ts). Storage state:
// playwright/.auth/qa-client.json, for the persistent
// qa-e2e-client@example.qa persona in the persistent "qa-e2e-demo-tenant"
// (scripts/qa-seed-e2e-personas.mjs). Read-only: navigation + assertions
// only, no sign-out.

test("Client home loads as an authenticated client, not staff shell", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const response = await page.goto("/client/home");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening)/i, level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("A SuperAdmin-only route denies the client persona", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/admin/user-audit");
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page).not.toHaveURL(/\/admin\/user-audit/);
  expect(errors).toEqual([]);
});
