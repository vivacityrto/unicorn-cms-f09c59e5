# Audit: 2026-08-05 — Xero OAuth integration + `oauth_tokens.provider_account_id`

**Trigger:** ad-hoc — building the Xero connection and invoice paid/unpaid lookup for Vivacity staff inside Unicorn 2.0, instead of only via a manual deep link into Xero's web UI.
**Scope:** One schema change (`oauth_tokens.provider_account_id`, nullable, no RLS change) applied directly to production Supabase, plus a hand-written codebase hotfix (new `xero-auth` and `xero-invoice-status` edge functions, new frontend pages/routes, `.env` hygiene fix, `XeroCard.tsx` extended with invoice status). No other tables touched.

---

## Findings

- **No prior Xero API integration existed.** The only prior Xero-related code was `tenants.xero_contact_url` / `xero_repeating_invoice_url` — manually-pasted deep links into Xero's web UI (`XeroCard.tsx`), plus a frozen one-time legacy backfill (`unicorn1."U1_XeroURL"`, see `2026-05-14-u1-xerourl-rls.md`). No OAuth, no API calls, no paid/unpaid data ever surfaced in-app.
- **The codebase already has a working custom-OAuth pattern** (`supabase/functions/outlook-auth`, `oauth_tokens`/`oauth_states` tables) for the Microsoft/Outlook calendar integration. Rather than inventing a new mechanism, this session extends that existing pattern for Xero (`provider = 'xero'`) instead of using Supabase Auth's built-in OAuth providers, which don't fit this use case (those authenticate end-users into `auth.users`; this needs a long-lived server-side connection to one specific Xero organisation's accounting data).
- **Xero's OAuth token isn't self-scoping.** After the authorization-code exchange, a separate `GET /connections` call is required to learn which Xero organisation(s) the grant actually covers, returning a `tenantId` that must be sent on the `Xero-tenant-id` header for every subsequent Accounting API call. `oauth_tokens` had no column to cache this — hence the schema change.
- **This is a shared, org-level connection, not per-user.** Unlike Outlook (each staff member connects their own calendar), there is exactly one real Vivacity Xero organisation. `oauth_tokens` is still keyed `(user_id, provider)`, so the row is technically owned by whichever Super Admin completes the "Connect to Xero" step (expected: Nova Canto, confirmed `Standard` role with `Connect Apps` permission on the real Vivacity org — not a demo/trial company). The `xero-auth` edge function's `status`/future-sync actions read by `provider = 'xero'` alone (service-role, ignoring `user_id`), so any Vivacity staff use of the connection doesn't depend on whose session initiated it.
- **Access gating deliberately diverges from the Outlook precedent.** `outlook-auth` lets any authenticated user manage their own connection (self-service, low stakes). Because Xero exposes real financial data across all client tenants, `xero-auth`'s `get-auth-url`/`disconnect` actions are restricted to Super Admin + `is_vivacity_internal`; `status` is readable by any Vivacity staff.
- **`.env` hygiene gap found and fixed in the same session.** `unicorn-cms-f09c59e5/.env` had no `.gitignore` entry and was tracked in git (from the original Lovable remix commit). The Xero Client ID/Secret were briefly added to this tracked, uncommitted file before being moved to Supabase Edge Function secrets. Caught before any commit — the secret never entered git history, so no rotation was required. Fixed by untracking `.env` and adding it to `.gitignore`.
- **The Xero Contact ↔ tenant mapping problem turned out to be a non-issue.** The existing `tenants.xero_contact_url` values (e.g. `https://go.xero.com/app/!6hi6G/contacts/contact/{GUID}/...`) already embed the real Xero `ContactID` as a GUID in the path. `xero-invoice-status` extracts it with a regex rather than requiring a separate Contact-matching exercise against Xero's API.

---

## DB changes shipped

Migration applied directly via Supabase MCP (`yxkgdalkbrriasiyyrwk`, production):

```sql
ALTER TABLE public.oauth_tokens
  ADD COLUMN IF NOT EXISTS provider_account_id text;

COMMENT ON COLUMN public.oauth_tokens.provider_account_id IS
  'Provider-specific account/org identifier captured during OAuth connection (e.g. Xero connection tenantId from GET /connections, required on the Xero-tenant-id header for all subsequent Accounting API calls). Null for providers that do not need one.';
```

No RLS change — the existing `oauth_tokens_restrict_owner_or_superadmin` (+ owner-scoped SELECT/INSERT/UPDATE/DELETE, + `superadmin_select_oauth_tokens`) policies already cover the new column since RLS in Postgres is row-level, not column-level.

---

## Codebase observations

`unicorn-cms-f09c59e5` — hand-written hotfix, not a Lovable prompt. Branch `hotfix/env-gitignore`, commit `c48494df1e8f852dd6b326b37d75da166a911dda`, PR [#158](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/158) (open, not yet merged at time of writing).

- `supabase/functions/xero-auth/index.ts` (new) — `get-auth-url`, `exchange-code`, `status`, `disconnect`.
- `supabase/functions/xero-invoice-status/index.ts` (new) — resolves ContactID from `xero_contact_url`, refreshes the access token if within 60s of expiry (Xero rotates refresh tokens on every use — new one saved immediately), fetches `GET /api.xro/2.0/Invoices?ContactIDs=...`, returns simplified status/amount/due-date per invoice. Gated to `is_vivacity_internal` (read-only, no Super Admin requirement, unlike connect/disconnect).
- `src/pages/XeroCallback.tsx`, `src/pages/AdminXeroIntegration.tsx`, `src/pages/AdminXeroIntegrationWrapper.tsx`, `src/hooks/useXeroConnectionStatus.tsx` (new).
- `src/components/client/XeroCard.tsx` extended with a "Check Xero" button rendering each invoice's status/amount/due date.
- Routes added in `src/App.tsx`: `/admin/integrations/xero` (Super Admin gated), `/admin/integrations/xero-callback` (public callback, no route guard — mirrors `outlook-callback`, since Xero's redirect may not carry an existing Supabase session).
- `supabase/config.toml`: `xero-auth` and `xero-invoice-status` added with `verify_jwt = false` (auth enforced in-function, matching `outlook-auth`).
- `.gitignore` + `.env` untracking (see Findings).

---

## Decisions

- **Reuse `oauth_tokens`/`oauth_states` rather than new Xero-specific tables.** Matches existing convention, avoids a second OAuth-storage pattern in the codebase for no real benefit.
- **One shared org-level connection, not per-client-tenant or per-staff-member.** Reflects Xero's actual org structure (one Vivacity Xero organisation, many client Contacts inside it) rather than mirroring Outlook's per-user model, which doesn't fit.
- **Stricter access gate than Outlook's precedent.** Super Admin required to connect/disconnect, given the financial-data blast radius; any Vivacity staff can view status.
- **Ship as a hand-written git hotfix, not a Lovable prompt.** Consistent with the standing 2026-07-28 write-permissions change for this repo; no phased-prompt workflow required, but this audit entry fulfils the still-standing schema-change audit requirement.

---

## Open questions parked

- **Invoice status is fetched live on demand, not cached/synced.** No new table was added to store invoice history — `xero-invoice-status` calls Xero's API directly each time "Check Xero" is clicked. Fine for the current low-volume, ad-hoc use case; would need revisiting if this becomes a dashboard-level or bulk-reporting feature.
- **Tenants without a `xero_contact_url` saved get no lookup path.** Only tenants with an already-populated `xero_contact_url` (the 122-row Feb 2026 legacy backfill plus anything added since via `XeroCard`) can use the invoice lookup. No UI flow yet to search/link a tenant to its Xero Contact if the URL is missing.
- **PR #158 not yet merged.** Per session-end ritual, merge only on explicit instruction — not done automatically.

---

## Tag

`audit-2026-08-05-xero-oauth-provider-account-id`
