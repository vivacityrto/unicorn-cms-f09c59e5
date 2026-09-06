import { test, expect, type Page } from "@playwright/test";

// Read-only operational characterization for the SuperAdmin persona. These
// checks exercise the current public workflow surfaces and their safe list /
// filter behavior without creating, sending, syncing, deleting, or saving
// production data.

async function openOperationalPage(page: Page, path: string, heading: RegExp) {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(path);
  expect(response?.status(), `${path} should return a successful response`).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();

  return pageErrors;
}

test("Manage Clients loads real client operations and supports safe filtering", async ({ page }) => {
  const pageErrors = await openOperationalPage(page, "/manage-tenants", /Manage Clients/);
  const search = page.getByPlaceholder("Search clients by name or slug...");

  await expect(search).toBeVisible();
  await search.fill("__characterization_no_match__");
  await expect(search).toHaveValue("__characterization_no_match__");
  await search.fill("");
  await expect(search).toHaveValue("");
  expect(pageErrors).toEqual([]);
});

test("Team Communications exposes the message history workflow", async ({ page }) => {
  const pageErrors = await openOperationalPage(page, "/communications", /Team Communications/);
  const historyTab = page.getByRole("tab", { name: "Bulk Message History" });

  await expect(historyTab).toBeVisible();
  await historyTab.click();
  await expect(historyTab).toHaveAttribute("aria-selected", "true");
  expect(pageErrors).toEqual([]);
});

test("Document management and bulk-generation jobs are reachable", async ({ page }) => {
  const pageErrors = await openOperationalPage(page, "/manage-documents", /Manage Documents/);
  const search = page.getByPlaceholder("Search by ID, name, or description...");

  await expect(search).toBeVisible();
  await search.fill("__characterization_no_match__");
  await expect(search).toHaveValue("__characterization_no_match__");
  await search.fill("");

  await openOperationalPage(page, "/manage-documents/bulk-jobs", /Bulk generation jobs/);
  expect(pageErrors).toEqual([]);
});

test("SharePoint folder mapping and site configuration surfaces load", async ({ page }) => {
  const pageErrors = await openOperationalPage(page, "/admin/sharepoint-folder-mapping", /SharePoint Folder Mapping/);
  const tenantSearch = page.getByPlaceholder("Search by tenant name or RTO ID...");

  await expect(tenantSearch).toBeVisible();
  await tenantSearch.fill("__characterization_no_match__");
  await expect(tenantSearch).toHaveValue("__characterization_no_match__");
  await tenantSearch.fill("");

  await openOperationalPage(page, "/admin/sharepoint-sites", /SharePoint Sites/);
  expect(pageErrors).toEqual([]);
});

test("Stage management exposes the phase list and safe search", async ({ page }) => {
  const pageErrors = await openOperationalPage(page, "/manage-stages", /Manage Phases/);
  const search = page.getByPlaceholder("Search stages...");

  await expect(search).toBeVisible();
  await search.fill("__characterization_no_match__");
  await expect(search).toHaveValue("__characterization_no_match__");
  await search.fill("");
  expect(pageErrors).toEqual([]);
});

test("Package Builder exposes package inventory and safe search", async ({ page }) => {
  const pageErrors = await openOperationalPage(page, "/admin/manage-packages", /Package Builder/);
  const search = page.getByPlaceholder("Search packages...");

  await expect(search).toBeVisible();
  await search.fill("__characterization_no_match__");
  await expect(search).toHaveValue("__characterization_no_match__");
  await search.fill("");
  expect(pageErrors).toEqual([]);
});
