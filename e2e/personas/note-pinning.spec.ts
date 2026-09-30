import { test, expect, type Page } from "@playwright/test";

// Note pinning, consolidated onto the `notes` table (audit entry
// docs/audit-log/entries/2026-09-30-consolidate-note-pinning-onto-notes.md).
// Super Admin persona, Demo RTO (tenant 7547) only.
//
// The read-only tests always run. The round-trip test WRITES to production
// (it pins then unpins one existing Demo RTO note, restoring it in a finally
// block), so it only runs when E2E_ALLOW_WRITES=1 and never against any other
// tenant. Neither test signs out or creates/deletes any note. Each pin/unpin
// also leaves two internal timeline entries on Demo RTO (they cannot be
// removed by the test, and are the behaviour under test).

const DEMO_RTO = 7547;
const tenantUrl = (tab: string) => `/tenant/${DEMO_RTO}?tab=${tab}`;

async function openTab(page: Page, tab: string) {
  await page.goto(tenantUrl(tab));
  await expect(page).not.toHaveURL(/\/login/);
  await page.waitForLoadState("networkidle").catch(() => {});
}

for (const tab of ["overview", "notes", "timeline", "packages"]) {
  test(`Demo RTO ${tab} tab loads without page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await openTab(page, tab);
    // Some tabs (e.g. Timeline) live behind an overflow control, not the visible
    // tablist, so assert on the rendered panel rather than the tab button.
    await expect(page.getByRole("tabpanel").first()).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });
}

test("Pinned notes card is the same list on Overview and Timeline", async ({ page }) => {
  await openTab(page, "overview");
  const overviewCard = page.getByTestId("pinned-notes-card");
  const hasCard = await overviewCard.isVisible({ timeout: 10_000 }).catch(() => false);

  await openTab(page, "timeline");
  const timelineCard = page.getByTestId("pinned-notes-card");
  await expect(timelineCard.isVisible({ timeout: 10_000 }).catch(() => false)).resolves.toBe(hasCard);

  if (hasCard) {
    const overviewTitles = await overviewCard.getByTestId("pinned-note").locator("p.font-medium").allInnerTexts();
    const timelineTitles = await timelineCard.getByTestId("pinned-note").locator("p.font-medium").allInnerTexts();
    expect(timelineTitles).toEqual(overviewTitles);
  }
});

test.describe("pin round trip (writes to Demo RTO)", () => {
  test.skip(process.env.E2E_ALLOW_WRITES !== "1", "set E2E_ALLOW_WRITES=1 to run; pins/unpins one Demo RTO note");

  test("pinning from the Notes tab shows in the shared card, unpinning removes it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openTab(page, "notes");

    // An existing, titled, currently-unpinned note row.
    const rows = page.locator("div.cursor-pointer.rounded-lg.border");
    const target = rows
      .filter({ has: page.locator("span.font-medium") })
      .filter({ hasNot: page.locator("svg.lucide-pin") })
      .first();
    await expect(target).toBeVisible({ timeout: 15_000 });
    const title = (await target.locator("span.font-medium").first().innerText()).trim();

    const rowFor = () => rows.filter({ hasText: title }).first();
    const pickMenuItem = async (name: RegExp) => {
      await rowFor().getByRole("button").last().click();
      await page.getByRole("menuitem", { name }).click();
    };

    let pinned = false;
    try {
      await pickMenuItem(/^Pin$/);
      pinned = true;
      // Correct toast — not the old generic "Note updated".
      await expect(page.getByText("Note pinned", { exact: true }).first()).toBeVisible();
      await expect(rowFor().locator("svg.lucide-pin")).toBeVisible();

      // The same pin appears in the shared card on Overview and Timeline.
      for (const tab of ["overview", "timeline"]) {
        await openTab(page, tab);
        await expect(page.getByTestId("pinned-notes-card").getByText(title, { exact: true })).toBeVisible({
          timeout: 15_000,
        });
      }

      // ...and the Timeline recorded the pin as its own entry (DB trigger).
      await expect(page.getByText(`Note pinned: ${title}`, { exact: false }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Unpin from the shared card; it disappears immediately (optimistic).
      const card = page.getByTestId("pinned-notes-card");
      await card
        .getByTestId("pinned-note")
        .filter({ hasText: title })
        .getByRole("button", { name: /unpin note/i })
        .click();
      pinned = false;
      await expect(page.getByText("Note unpinned", { exact: true }).first()).toBeVisible();
      await expect(page.getByTestId("pinned-note").filter({ hasText: title })).toHaveCount(0);
      // The Timeline (still open) reloads and gains the unpin entry.
      await expect(page.getByText(`Note unpinned: ${title}`, { exact: false }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      // Restore Demo RTO to how we found it, whatever happened above.
      if (pinned) {
        await openTab(page, "notes");
        await rowFor().getByRole("button").last().click();
        await page.getByRole("menuitem", { name: /^Unpin$/ }).click();
        await expect(page.getByText("Note unpinned", { exact: true }).first()).toBeVisible();
      }
    }

    expect(errors).toEqual([]);
  });
});
