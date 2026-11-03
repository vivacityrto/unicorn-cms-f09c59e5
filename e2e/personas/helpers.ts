import { expect, type Page } from "@playwright/test";

// The real Demo RTO client account can have an unread portal update, which opens a review
// overlay over the page. Close it with its X: that only changes dialog state, whereas Done or
// Open details would mark the production notification read or navigate away.
export async function closePortalUpdateIfShown(page: Page) {
  const dialog = page.getByRole("dialog").filter({ hasText: /portal update/i });
  await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  }
}
