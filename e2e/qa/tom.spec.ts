import { test, expect, type Page } from "@playwright/test";
import { startSupabaseWaterfall } from "./supabase-waterfall";

// TOM P0.2/P0.3 read-only characterization against the allowlisted
// unicorn-qa project. The fixture and persona provisioning are documented in
// docs/kb/reference/tenant-operating-model/p0/p0-2-qa-fixture-seed-record-2026-09-13.md.
// This spec intentionally performs no writes, invitations, exports, or
// promotion actions.

const CLIENT_PROJECTS = new Set([
  "qa-tom-client-admin-a",
  "qa-tom-client-user-a",
  "qa-tom-client-admin-b",
]);

async function openReadOnlyPage(page: Page, path: string, heading: RegExp, label: string) {
  const startedAt = performance.now();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const finishWaterfall = startSupabaseWaterfall(page, `${label} ${path}`);

  const response = await page.goto(path);
  expect(response?.status(), `${path} should return a successful response`).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 25_000 });
  expect(pageErrors).toEqual([]);
  console.log(`[tom-p0-timing] ${label} ${path} ${Math.round(performance.now() - startedAt)}ms`);
  await finishWaterfall();
}

test("persona reaches its current tenant/staff read shell", async ({ page }, testInfo) => {
  if (CLIENT_PROJECTS.has(testInfo.project.name)) {
    await openReadOnlyPage(page, "/client/home", /Good (morning|afternoon|evening)/i, testInfo.project.name);
    return;
  }

  await openReadOnlyPage(page, "/manage-tenants", /Manage Clients/, testInfo.project.name);
  const search = page.getByPlaceholder("Search clients by name or slug...");
  await expect(search).toBeVisible();
  await search.fill("__tom_p0_no_match__");
  await expect(search).toHaveValue("__tom_p0_no_match__");
  await search.fill("");
  await expect(search).toHaveValue("");
});

test("client persona reads packages and preserves the relationship-role user-management gate", async ({ page }, testInfo) => {
  test.skip(!CLIENT_PROJECTS.has(testInfo.project.name), "client-only read characterization");

  await openReadOnlyPage(page, "/client/packages", /Packages/, testInfo.project.name);

  // The current fixture deliberately uses relationship_role=user for all
  // three client personas. ClientRouteGuard therefore redirects this route
  // to /client/home; the legacy Admin/Client Parent labels do not grant the
  // management surface. This assertion records current behavior rather than
  // treating the redirect as a harness failure.
  const startedAt = performance.now();
  const finishWaterfall = startSupabaseWaterfall(page, `${testInfo.project.name} /client/users-redirect`);
  await page.goto("/client/users");
  await expect(page).toHaveURL(/\/client\/home(?:$|\?)/, { timeout: 45_000 });
  console.log(`[tom-p0-timing] ${testInfo.project.name} /client/users-redirect ${Math.round(performance.now() - startedAt)}ms`);
  await finishWaterfall();
});
