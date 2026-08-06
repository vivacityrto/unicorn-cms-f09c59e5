# Audit: 2026-06-30 — email-linked-viewer-access

**Trigger:** ad-hoc — surfaced during Outlook email linking feature investigation
**Scope:** `email_messages`, `email_message_attachments`, and `email-attachments` storage RLS policies; `email_messages.body_html` column addition; downstream edge functions and frontend components

## Findings

- `email_messages` SELECT RLS was scoped to `user_uuid = auth.uid()` only — no team-member policy existed. Every Vivacity team member other than the original linker saw an empty list on the client Emails tab. This is a shared CRM feature; team-wide visibility was the stated intent.
- `email_message_attachments` SELECT policy contained a hardcoded `em.user_uuid = auth.uid()` join condition. Even after fixing the parent-table SELECT, team members were denied attachment metadata.
- Storage bucket `email-attachments` SELECT policy checked `auth.uid()::text = storage.foldername(name)[2]`. Team members could not download attachment files even if they could see the email record.
- `EmailViewDialog` called `sync-outlook-calendar` `get-email-body` using the **viewer's** OAuth token against the `external_message_id` from the original linker's mailbox. Microsoft Graph returns a 404 for a foreign mailbox message ID → edge function returned 500 → "Edge Function returned a non-2xx status code" error for all non-linker viewers. This was the presenting symptom that surfaced the root cause.
- `email_messages.body_html` column did not exist. Full HTML body was never persisted at link time — only a 900-char `body_preview`.
- `addin-email-capture` edge function had a latent insert bug: it wrote `body_content` and `body_content_type` keys that do not exist on the table. PostgREST was silently dropping those keys on every add-in capture.

## DB changes shipped

All RLS changes applied directly via Supabase SQL editor (project `yxkgdalkbrriasiyyrwk`); migration via Lovable.

- **`email_messages_select`** policy replaced: `user_uuid = auth.uid()` → `user_uuid = auth.uid() OR is_vivacity_team_safe(auth.uid()) OR is_super_admin_safe(auth.uid())`
- **`email_message_attachments_select`** policy replaced: EXISTS subquery now applies the same three-way team-scoped check instead of the old `em.user_uuid = auth.uid()` check
- **`email_attach_storage_select`** storage policy replaced: `auth.uid()::text = foldername(name)[2]` → same expression OR `is_vivacity_team_safe` OR `is_super_admin_safe`
- **`email_messages.body_html text`** column added (nullable, no default, TOAST-managed, no index). Column comment set. PostgREST schema reloaded via `NOTIFY pgrst`.

## KB changes shipped

- No changes — no KB doc covers the Outlook email linking feature in detail.

## Codebase observations

- unicorn-cms-f09c59e5 @ `73bc64bd`: 6 file edits applied via Lovable in one batch —
  - `supabase/functions/capture-outlook-email/index.ts`: `body_html` added to both `link-email` insert and `refresh-linked-email-metadata` update payloads
  - `supabase/functions/addin-email-capture/index.ts`: `body_content` → `body_html` rename; `body_content_type` removed (latent bug fix)
  - `src/hooks/useLinkedEmails.tsx`: `body_html: string | null` added to `LinkedEmail` interface; enrichment trigger extended to also fire when `body_html IS NULL`
  - `src/components/email/EmailViewDialog.tsx`: `bodyHtml` prop added; dialog reads from DB if present, calls Graph only for inbox-browse path, silent preview fallback for legacy rows viewed by non-linkers
  - `src/components/email/LinkedEmailsList.tsx`: `bodyHtml={email.body_html}` threaded to `EmailViewDialog`
  - `src/components/client/ClientStructuredNotesTab.tsx`: same prop threaded

## Decisions

- Sanitise HTML on read only — `sanitizeHtml` continues to gate every render; no sanitisation on write
- No `body_content_type` column — HTML assumed for all modern Outlook messages
- No size cap on `body_html` — revisit if TOAST bloat is observed
- Backfill strategy: opportunistic only via existing enrichment loop (extended to trigger on `body_html IS NULL`); original linker heals their own rows on next view; non-linkers see `body_preview` fallback for legacy rows
- Privacy: full email body readable by all Vivacity team members and super-admins via existing RLS — confirmed intentional

## Open questions parked

- `addin-email-capture` still has other ghost columns (`web_link`, `importance`, `is_read`, `categories`, `graph_enriched`, `graph_enriched_at`) not present on the table — separate fix needed
- Two identical unique indexes on `(user_uuid, external_message_id)` on `email_messages` — pre-existing redundancy, out of scope
- `OutlookInboxBrowser` Connect Outlook button still navigates to `/settings?tab=calendar` instead of triggering OAuth inline — Lovable prompt drafted and ready but not yet applied
- `ClientEmailsTab` domain filter has no toggle UI — Lovable prompt drafted and ready but not yet applied

## Tag
audit-2026-06-30-email-linked-viewer-access
