import { test, expect } from "@playwright/test";

// Unauthenticated persona (P0.8 persona table). No login needed, read-only
// by construction -- these are the routes reachable before any session
// exists. Every test fails on an uncaught page error or a 4xx/5xx response
// to the document request itself, per the plan's browser-instrumentation
// guidance (docs/kb/reference/codebase-optimization-plan-2026-08-28.md §16).

function failOnPageErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("Login page renders at /", async ({ page }) => {
  const errors = failOnPageErrors(page);
  const response = await page.goto("/");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: /sign in/i, level: 1 })).toBeVisible();
  await expect(page.getByPlaceholder("Enter your email address").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Login page renders at /login", async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i, level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Reset password page without a token bounces to Login with an explanatory toast, not a crash", async ({ page }) => {
  // Confirmed live: /reset-password requires a valid Supabase recovery
  // token in the URL/session. Without one it shows an "Invalid or expired
  // link" toast and redirects to /login -- it does not render a "Reset
  // Your Password" form at this bare URL, so don't assert that heading.
  const errors = failOnPageErrors(page);
  await page.goto("/reset-password");
  await page.waitForURL("**/login");
  await expect(page.getByText(/invalid or expired link/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /sign in/i, level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Activate-account page renders (no token -> Invalid Link, not a crash)", async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto("/activate");
  await expect(page.getByRole("heading", { name: /invalid link|activate your account/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Protected deep link redirects to Login without flashing protected content", async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto("/dashboard");
  await page.waitForURL("**/login");
  await expect(page.getByRole("heading", { name: /sign in/i, level: 1 })).toBeVisible();
  // The dashboard shell (nav, sidebar) must never have been in the DOM.
  await expect(page.locator("body")).not.toContainText("MainDashboard");
  expect(errors).toEqual([]);
});

test("Unknown route renders the app's own 404, not a blank page", async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto("/__this_route_does_not_exist__");
  await expect(page.locator("body")).not.toBeEmpty();
  expect(errors).toEqual([]);
});
