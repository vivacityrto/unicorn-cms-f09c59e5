# Onboarding Hub — Delta Plan

Most of the spec is already in place from the previous wizard work (Step 6 hub, tracking columns on `staff_provisioning_runs`, 9 seeded `staff_onboarding` templates, trigger that seeds `lifecycle_checklist_instances` when status flips to `provisioned`, `staff_induction_video_url` / `staff_onboarding_workbook_url` on `app_settings`, `OnboardingHub.tsx`, `OnboardingHubPage.tsx`, `useOnboardingHub.ts`).

This plan only covers the gaps in the new prompt.

## 1. Database migration

- Add column `staff_provisioning_runs.workbook_file_path text` (nullable). Holds the storage object path inside the `internal-onboarding` bucket (e.g. `workbooks/vivacity-team-onboarding-workbook-v3.pdf`). Coexists with the existing `app_settings.staff_onboarding_workbook_url` (URL stays as a fallback / external link).
- No new templates, no rename, no changes to `staff_provisioning_rules` or `dd_staff_role`.
- No changes to the existing seed trigger.

## 2. Storage bucket

Create private bucket `internal-onboarding` via `supabase--storage_create_bucket` (public=false). Workbook PDFs and any future internal-only onboarding assets live here. Never referenced from the client portal.

RLS on `storage.objects` for this bucket (RESTRICTIVE policies, scoped to bucket_id):
- SELECT / INSERT / UPDATE / DELETE allowed only when `public.has_role(auth.uid(), 'admin')` OR the caller is internal Vivacity staff per the existing staff-identity helper (whichever helper the codebase already uses for SuperAdmin checks — confirm during build).
- Explicitly no `anon` access, no `authenticated` blanket access, no client tenant scoping.

Files are served via short-lived signed URLs created server-side (edge function or `supabase.storage.from(...).createSignedUrl`) — never via public URLs.

## 3. UI placement change

Current state: the hub renders only as Wizard Step 6 and at `/admin/team-users/runs/:runId/onboarding`.

Add: a dedicated **Staff Provisioning Run detail page** at `/admin/team-users/runs/:runId` with a tab strip:
- `Overview` — existing run metadata (name, role, location, status, M365 details, error_message, graph_transcript summary)
- `Onboarding Hub` — renders `<OnboardingHub runId={runId} />` (the existing component, unchanged)
- `Audit / Transcript` — read-only `graph_transcript` viewer

Update entry points:
- `TeamUsers.tsx` row action "View Provisioning Run" → `/admin/team-users/runs/:runId` (Overview tab)
- `UserProfile.tsx` "View Onboarding Hub" → same route with `?tab=onboarding`
- Wizard Step 6 "Save & View Team Member" → same route with `?tab=onboarding`

The standalone `OnboardingHubPage.tsx` stays as a redirect to the new tabbed page for backward compatibility.

## 4. Workbook upload flow (new sub-feature in Onboarding Hub)

In Card 2 (Onboarding Workbook), add admin-only upload affordance:
- If `workbook_file_path` is set → show filename + "Download" (signed URL, 5 min expiry) + "Replace" + "Mark as Sent" (existing).
- If unset → show "Upload workbook PDF" dropzone (accept `application/pdf`, max ~25 MB).
- On upload: write to `internal-onboarding/workbooks/run-{runId}-{timestamp}.pdf`, store path on `staff_provisioning_runs.workbook_file_path`, write `audit_events` entry.
- Replacing a file deletes the prior object.

`app_settings.staff_onboarding_workbook_url` remains as the global default download link shown when a run has no per-run upload yet.

## 5. RLS / security confirmation

- `staff_provisioning_runs`, `lifecycle_checklist_instances`, `lifecycle_checklist_templates`: existing policies are admin/internal-staff only. Confirm no client-tenant policy grants `SELECT` on rows where `lifecycle_type='staff_onboarding'`. If any PERMISSIVE policy could leak, layer a RESTRICTIVE policy: `lifecycle_type <> 'staff_onboarding' OR public.has_role(auth.uid(),'admin')`.
- `internal-onboarding` bucket: admin-only as above.
- Induction video URL (`app_settings.staff_induction_video_url`) is fine for staff to read; the actual Academy video stays gated by Academy auth — Unicorn just embeds the URL.

## 6. Files to be created or modified

Created:
- `supabase/migrations/<ts>_onboarding_hub_workbook_storage.sql` — adds `workbook_file_path`, creates bucket policies (bucket itself via tool), adds RESTRICTIVE policies on the three tables if gaps found.
- `src/pages/admin/ProvisioningRunDetailPage.tsx` — new tabbed detail page.
- `src/components/admin/team-users/ProvisioningRunOverview.tsx`
- `src/components/admin/team-users/WorkbookUploader.tsx`
- `src/hooks/useWorkbookUpload.ts`

Modified:
- `src/App.tsx` — register `/admin/team-users/runs/:runId`; redirect old `/onboarding` path.
- `src/components/admin/team-users/OnboardingHub.tsx` — Card 2 uses `WorkbookUploader` and per-run signed URL.
- `src/hooks/useOnboardingHub.ts` — include `workbook_file_path` in fetched run.
- `src/pages/admin/NewStarterWizard.tsx` — Step 6 "Save & View" target route.
- `src/pages/UserProfile.tsx` — "View Onboarding Hub" target route.
- `src/pages/admin/OnboardingHubPage.tsx` — thin redirect.
- `src/pages/IntegrationSettings.tsx` — note that workbook URL is a fallback; per-run upload preferred.

## 7. Decisions needed before implement mode

1. **Per-run vs global workbook.** Spec says workbook is a single org-wide PDF uploaded by Dave. Plan above supports both (per-run override + global fallback). Confirm: keep both, or drop the per-run upload and just attach the global PDF from `app_settings` to every run?
2. **Signed URL TTL** — 5 minutes proposed. OK for Dave to share via email/Teams, or longer (e.g. 24h)?
3. **Workbook file size cap** — 25 MB proposed.
4. **Detail page tabs** — is the 3-tab split (Overview / Onboarding Hub / Audit) correct, or fold Audit into Overview?
5. **Old `/onboarding` route** — redirect (proposed) or hard-remove?

```text
/admin/team-users
  └─ /runs/:runId               ← NEW tabbed detail page
        ├─ ?tab=overview        (default)
        ├─ ?tab=onboarding      ← <OnboardingHub />
        └─ ?tab=audit
```

No implementation will start until these are answered and Implement Mode is enabled.