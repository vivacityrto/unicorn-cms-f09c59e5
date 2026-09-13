import { test, expect } from "@playwright/test";
import { startSupabaseWaterfall } from "./supabase-waterfall";

// Packet P2-QA -- anonymous route-denial characterization against unicorn-qa.
// This project intentionally has no storage state and performs no writes.

test("anonymous client route redirects to login without exposing data", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const finishWaterfall = startSupabaseWaterfall(page, "qa-anonymous /client/home");

  const response = await page.goto("/client/home");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login(?:$|\?)/);
  expect(errors).toEqual([]);
  await finishWaterfall();
});
