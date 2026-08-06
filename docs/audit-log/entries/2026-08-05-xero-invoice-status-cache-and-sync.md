# Audit: 2026-08-05 — Xero invoice status cache, scheduled sync, Manage Tenants pill/filter, webhook

**Trigger:** ad-hoc — continuation of the same-day Xero OAuth connection work (`2026-08-05-xero-oauth-provider-account-id.md`). Carl asked for a paid/unpaid pill on both the client detail header and the Manage Tenants list, a matching filter, and (mid-build) a webhook for near-real-time updates instead of only a scheduled sync.
**Scope:** One schema change (`tenants.xero_invoice_paid`/`xero_invoice_due_date`/`xero_invoice_checked_at`, all nullable, no RLS change) and one new `pg_cron` job, both applied directly to production Supabase. Four stacked PRs in `unicorn-cms-f09c59e5`, all merged to `main` same session after a local dev + Playwright QA pass. No other tables touched.

---

## Findings

- **Manage Tenants cannot do a live Xero call per row.** That list loads every tenant in one query with no pagination (`useTenantsBasic`, `select("*").range(0, 9999)`) — a live Xero API call per row would blow through Xero's 60/min rate limit and make the page unusably slow. This forced a cache-not-live design: `tenants.xero_invoice_paid`/`xero_invoice_due_date`/`xero_invoice_checked_at`, refreshed by (a) a scheduled `xero-invoice-sync-all` cron job every 6 hours, and (b) the existing manual "Check Xero" click (`xero-invoice-status`), which now also writes through to the same cache columns.
- **Batched, not one-call-per-tenant.** `xero-invoice-sync-all` groups tenants by their Xero `ContactID` (parsed from the existing `xero_contact_url` GUID, same technique as the earlier audit) and calls `GET /Invoices?ContactIDs=<25 comma-separated ids>` per batch rather than once per tenant. Manually triggered and verified against real data: 130 tenants checked, 34 paid, 37 unpaid, 59 linked-but-no-invoice-history.
- **Webhook events only carry an invoice ID, not the invoice.** `xero-webhook` (added mid-build once Carl asked whether Xero's webhook feature could replace waiting for the cron cycle) has to fetch the notified invoice first to learn its `ContactID`, then re-fetch that contact's full invoice list ordered by date to determine the true "most recent" — the notified invoice isn't necessarily the current one (e.g. an older invoice being edited). Caught and fixed during build, before shipping. Auth is HMAC-SHA256 signature verification against `XERO_WEBHOOK_KEY`, not a Supabase JWT — Xero calls this with no auth header at all.
- **Webhook not yet activated — blocked on Nova.** `XERO_WEBHOOK_KEY` secret is not set; the function 401s every real call by design until Nova registers the delivery URL (`https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/xero-webhook`) and the Invoices event category in the Xero Developer Portal, generating the signing key. The scheduled cron sync is the working fallback in the meantime and stays the reconciliation path even once the webhook is live (webhooks are at-least-once, not guaranteed).
- **Real bug found during QA: `xero-invoice-status` was missing a fix already applied elsewhere.** Earlier the same day, `xero-auth`'s token exchange hit `invalid_client` from Xero, root-caused to trailing whitespace in the `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` secrets breaking Basic Auth encoding — fixed with a defensive `.trim()`. That fix was correctly included when `xero-invoice-sync-all` and `xero-webhook` were written, but `xero-invoice-status` (written earlier, before the bug was found) never got it. Mid-QA, the connection's access token actually expired and the refresh call hit the same `invalid_client` error. Confirmed the fix resolved it and that the stored refresh token was never invalidated by the failed attempt (Xero rejects at the client-authentication step before it touches the grant), so no reconnection was needed — self-healed on the next successful call.
- **Deliberately no invoice line-item detail exposed to staff.** Per Carl's explicit instruction, none of the three render locations (client detail header, `XeroCard`, Manage Tenants) or the underlying API responses (`xero-invoice-status`, `xero-invoice-sync-all`, `xero-webhook`) return amounts, invoice numbers, or references — only a paid/unpaid signal and, if unpaid, the due date of the most recent invoice.
- **Overdue vs due-soon distinction added after live QA feedback.** Carl noticed cancelled/inactive tenants showing a plain "Due <date>" pill with dates from 2024 — indistinguishable from an invoice due next week. Added `src/lib/xeroInvoiceStatus.ts` (`isXeroInvoiceOverdue`) as a small shared helper so all three render locations show red "Overdue since <date>" once the due date has passed, rather than duplicating the date-comparison logic three times with drift risk.
- **GitHub's stacked-PR auto-retarget is not reliable.** After merging PR2 and deleting its branch, PR3 (originally #169) was auto-*closed* by GitHub instead of retargeted to `main`, despite that being the documented behaviour for a PR whose base branch is deleted. Recovered by opening a fresh PR (#177) from the same commit directly against `main` — no code was lost, just the PR wrapper. Learned to explicitly `gh pr edit --base main` the *next* PR in the stack before merging/deleting the *current* one, rather than relying on auto-retarget — done successfully for PR4 before merging PR3.
- **Button icon-overlap cosmetic bug**, unrelated to Xero specifically but found on the "Check Xero" button: shadcn `Button`'s `isLoading` branch renders its own `Loader2` spinner wrapped around whatever `children` were passed — if the caller's own children include their own icon (as ours did), both render stacked during the loading state. Fixed locally by suppressing our icon while `checkingInvoices` is true. Not fixed at the shared `Button` component level — other existing callers with the same pattern (e.g. the "Save" button elsewhere in `XeroCard`) were left as-is since that's a pre-existing, unrelated cosmetic issue outside this session's scope.

---

## DB changes shipped

Migration applied directly via Supabase MCP (`yxkgdalkbrriasiyyrwk`, production), later added to the repo as `supabase/migrations/20260805060000_tenants_xero_invoice_cache_columns.sql`:

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS xero_invoice_paid boolean,
  ADD COLUMN IF NOT EXISTS xero_invoice_due_date date,
  ADD COLUMN IF NOT EXISTS xero_invoice_checked_at timestamptz;
```

Plus a `pg_cron` schedule (`supabase/migrations/20260805063000_xero_invoice_sync_all_schedule.sql`), matching the existing `sync-outlook-calendar-cron` pattern exactly (service-role JWT via `private.cron_function_jwt()`):

```sql
SELECT cron.schedule(
  'xero-invoice-sync-all-every-6h',
  '0 */6 * * *',
  $$ ... net.http_post to xero-invoice-sync-all ... $$
);
```

No RLS changes — the new columns are covered by the existing row-level policies on `tenants`.

---

## Codebase observations

`unicorn-cms-f09c59e5`, four PRs, all hand-written hotfixes/features (not Lovable), all merged to `main`:

| PR | Content | Merge commit |
|---|---|---|
| #167 | Cache columns write-through, `ClientDetail` header pill reads cache | `5954beb4` |
| #168 | `xero-invoice-sync-all` cron function + schedule | `f434572d` |
| #177 (originally #169, re-opened after auto-close) | Manage Tenants pill + invoice-status filter | `289bcb78` |
| #170 | `xero-webhook`, plus QA-round fixes (overdue distinction, missing `.trim()`, button icon overlap) | `c9c936b8` |

New files: `supabase/functions/xero-invoice-sync-all/index.ts`, `supabase/functions/xero-webhook/index.ts`, `src/components/client/XeroInvoiceStatusBadge.tsx`, `src/lib/xeroInvoiceStatus.ts`. Modified: `xero-invoice-status`, `xero-auth` (unrelated to this round — already covered by the earlier audit), `XeroCard.tsx`, `ClientDetail.tsx`, `ManageTenants.tsx`, `supabase/config.toml`.

QA performed live against the production Supabase backend via local dev server (`npm run dev`) + Playwright, per the existing "local dev + Playwright QA" convention. Verified: header pill reads from cache with no extra network call; Manage Tenants filter narrows to exactly 34 for "Paid", matching the SQL-verified count; overdue/due-soon colour distinction renders correctly; connection self-heal confirmed after the `.trim()` fix.

---

## Decisions

- **Cache, not live-per-row, for any list-page rendering.** Non-negotiable given Manage Tenants' unpaginated load pattern and Xero's rate limits — documented directly in the column comment so a future reader doesn't reintroduce a live call.
- **Webhook is additive to the cron sync, not a replacement.** Kept the 6-hourly sync as the reconciliation fallback regardless of webhook health, per standard webhook-reliability practice.
- **Re-derive "most recent invoice" server-side rather than trusting webhook payload order.** Applies uniformly across `xero-invoice-status`, `xero-invoice-sync-all`, and `xero-webhook` — all three independently query and sort by date rather than assuming any one signal (the notified invoice, the batch order) is authoritative.
- **No invoice amounts/numbers/references anywhere in this feature**, by explicit instruction — paid/unpaid + due date only.
- **Explicit base-branch retargeting for stacked PRs going forward**, rather than relying on GitHub's automatic retarget-on-delete, given it silently closed a PR this session instead.

---

## Open questions parked

- **No cache invalidation if `xero_contact_url` changes.** If a tenant's Xero Contact link is edited or removed, the cached `xero_invoice_paid`/`due_date` columns are not cleared — they'll just go stale until the next sync-all run picks up the new (or absent) mapping. Low risk given how rarely that field changes, not actioned this session.
- **Manage Tenants filter has no distinct "Overdue" bucket.** "Unpaid" includes overdue invoices; the pill visually distinguishes them but the filter dropdown does not. Not requested — flagging in case it's wanted later.
- **Webhook still needs Nova to complete portal registration** (delivery URL + Invoices event subscription) before `XERO_WEBHOOK_KEY` can be set and the fast path activated.

---

## Tag

`audit-2026-08-05-xero-invoice-status-cache-and-sync`
