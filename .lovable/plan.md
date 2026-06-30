# Fix: "Back to Clients" link does not work

## Root cause
In `src/pages/ClientDetail.tsx` (line 276), the header back button uses `navigate(-1)`. When the user lands on the tenant page directly (refresh, deep link, new tab, or after a redirect), the browser has no prior history entry inside the SPA, so `navigate(-1)` does nothing visible.

## Change
In `src/pages/ClientDetail.tsx`, replace the `onClick={() => navigate(-1)}` handler on the "Back to Clients" button with a deterministic destination so the label matches the behaviour:

- Navigate to `/manage-tenants` (same destination already used by the "Client not found" fallback button at line 260).

No other files change. No business logic change — purely a presentation/navigation fix.

## Verification
- Hard-reload `/tenant/:id` and click "Back to Clients" → lands on `/manage-tenants`.
- Navigate from Manage Clients → tenant page → Back → returns to `/manage-tenants` (same as before from user's perspective).
