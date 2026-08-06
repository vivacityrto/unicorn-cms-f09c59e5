# Unicorn 2.0 — PDP Module Follow-up Prompts

**Module:** Vivacity Academy → Professional Development Plan (PDP)  
**Addresses gaps from:** `handoffs/pdp-lovable-prompts.md` (Prompts 1–12)  
**Cross-checked against codebase:** 12 May 2026 (`unicorn-cms-f09c59e5` HEAD `aa81aab0`)  
**Run order:** F-RLS first (blocks manual cycle creation). F13 and F14 are UI-only and can run in either order after that. F15-pre before F15. F16 depends on F15.

---

## Why these prompts exist

A codebase audit on 12 May 2026 found that Prompts 1–10 and 12 (core) shipped clean but gaps remain. A live RLS check on 12 May 2026 also found two blocking policy bugs on `pdp_cycles`:

| Gap | Source | Follow-up |
|-----|--------|-----------|
| No INSERT policy for users on `pdp_cycles` — "Start your PDP cycle" CTA fails | RLS audit | F-RLS |
| UPDATE `with_check` prevents status → 'completed' — "Close cycle" fails for users | RLS audit | F-RLS |
| PDP nav link not in Academy sidebar | Prompt 1 | F13 |
| `QuickReflectionDrawer` built but not wired into lesson viewer | Prompt 7 | F14 |
| `supabase/functions/pdp-export/` entirely absent | Prompt 11 | F15-pre + F15 |
| Tenant admin audit pack is CSV-only; no ZIP bundle | Prompt 12 | F16 (depends on F15) |

**Operational note (not a Lovable prompt):** The five core PDP migrations (`pdp_audiences_reference`, `pdp_core_tables`, `pdp_indexes_and_triggers`, `pdp_rls_policies`, `pdp_views_summary_and_currency`) were applied directly to Supabase on 11 May 2026 and are not in the repo's `supabase/migrations/` directory. The schema is live and correct. Before the next DB-touching Lovable session, run `supabase db pull` (or use Supabase MCP `list_migrations` to confirm) so version control reflects reality.

---

## Hard rules (unchanged from original)

- RLS is on every PDP table. Do not bypass.
- All evidence file uploads go to a private Storage bucket. Browser receives signed URLs only.
- `supabase-js` in the SPA. No Prisma. No `VITE_*` for secrets.
- TypeScript strict. No `any` in new code.
- New code slots beside existing Academy code — do not refactor `academy_*` UI unless the prompt explicitly says so.

---

## Updated codebase facts (supersedes the table in `pdp-lovable-prompts.md`)

| Fact | Detail |
|---|---|
| Lesson viewer | `src/pages/client/AcademyLessonViewerPage.tsx`. Route: `/academy/course/:slug/lesson/:lessonId`. |
| Lesson completion hook | `src/hooks/academy/useCompleteEnrollment.ts`. `showCelebration` state in the viewer page fires on auto-complete. |
| Navigation config | `src/config/navigationConfig.ts` → `academyMenuSections` array. Do NOT edit any sidebar component directly. |
| PDP feature module | `src/features/pdp/` — exists. Types, API helpers, hooks, and components all present. |
| PDP pages | `src/pages/academy/pdp/index.tsx`, `cycle/[cycleId].tsx`, `reviews.tsx` — all exist. |
| Tenant admin PDP page | `src/pages/client/StaffPdpsPage.tsx` (NOT `src/pages/tenant/`) |
| PDP components | `src/components/academy/pdp/` — full set including `QuickReflectionDrawer.tsx`, `EvidenceSheet.tsx`, `GoalSheet.tsx` |
| Academy page shell | `AcademyPageWrapper` from `@/components/academy/AcademyPageWrapper`. Props: `title`, `subtitle`, `icon`, `accentColour` (Australian spelling). |
| Shared edge function helpers | `_shared/cors.ts` and `_shared/supabase-client.ts` (not `supabase.ts`). |
| Tenant context hook | `useClientTenant()` from `@/contexts/ClientTenantContext` — exposes `activeTenantId: number | null`. |
| Superadmin route guard | `<ProtectedRoute requireSuperAdmin>` in `src/App.tsx`. |
| RBAC hook | `useRBAC()` from `@/hooks/useRBAC` — exposes `isSuperAdmin`, `isVivacityTeam`. |

---

## Prompt F-RLS — Fix pdp_cycles INSERT and close-cycle policies

**Type:** Supabase migration — triggers the full DB change workflow from `handoffs/lovable-production-db-change.md` before running. **This is a blocker: run before any user can create a cycle from the UI.**

**Problem 1:** `pdp_cycles` has no INSERT policy for regular authenticated users. The `createCycle()` helper (called from the "Start your PDP cycle" empty-state CTA and the start-cycle modal) executes via the browser supabase client. Without an INSERT policy it fails with an RLS violation for all non-Vivacity users. The auto-evidence Edge Function is unaffected (uses service role), but manual cycle creation is blocked.

**Problem 2:** The existing `pdp_cycles: users update own while open` UPDATE policy has `with_check: user_id = auth.uid() AND status IN ('planning', 'active')`. When a user closes their cycle (status → `'completed'`), the new row fails the `with_check`. The "Close cycle" button silently fails for all non-Vivacity users.

Apply a single migration that:

1. Adds a new INSERT policy:
   ```sql
   CREATE POLICY "pdp_cycles: users create own"
   ON public.pdp_cycles
   FOR INSERT
   TO authenticated
   WITH CHECK (user_id = auth.uid());
   ```

2. Drops the existing UPDATE policy and recreates it with a corrected `with_check`:
   ```sql
   DROP POLICY "pdp_cycles: users update own while open" ON public.pdp_cycles;

   CREATE POLICY "pdp_cycles: users update own while open"
   ON public.pdp_cycles
   FOR UPDATE
   TO authenticated
   USING (
     user_id = auth.uid()
     AND status = ANY(ARRAY['planning', 'active', 'under_review'])
   )
   WITH CHECK (
     user_id = auth.uid()
   );
   ```
   The `USING` clause (which rows can be updated) stays restrictive — users cannot reopen a completed or archived cycle. The `WITH CHECK` (what the new row must look like) only requires ownership — allowing any valid forward status transition.

No other changes. Do not touch any other table's policies.

---

## Prompt F13 — Add PDP to Academy sidebar nav

**Type:** UI only — no migration. Safe to run without the DB change workflow.

In `src/config/navigationConfig.ts`, find the `academyMenuSections` array. Add a new entry to the main Academy section for the Professional Development Plan:

- **Label:** "My PDP"
- **Icon:** `ClipboardList` (from `lucide-react`)
- **Route:** `/academy/pdp`
- **Active-state colour:** Acai `#44235F` — use the same pattern as the existing Academy nav items (check whether active state is applied via Tailwind class, inline style, or a `accentColour` prop, and match it exactly)
- **Position:** After "My Courses", before "Certificates"

Do not edit any sidebar component file directly. The `navigationConfig.ts` change is the only edit required.

---

## Prompt F14 — Wire QuickReflectionDrawer into lesson viewer (completes Prompt 7)

**Type:** UI only — no migration. Safe to run without the DB change workflow.

Open `src/pages/client/AcademyLessonViewerPage.tsx`.

The page already has a `showCelebration` state that fires when `useCompleteEnrollment` marks a lesson as complete. Immediately after `showCelebration` becomes `true`, also set a new piece of local state — `showReflectionPrompt: boolean` — to `true`.

Render `<QuickReflectionDrawer>` (already at `src/components/academy/pdp/QuickReflectionDrawer.tsx`) conditionally on `showReflectionPrompt`, passing:

- `lessonProgressId` — the ID of the just-completed `academy_lesson_progress` row (already available in the completion flow)
- `onClose` — sets `showReflectionPrompt` back to `false`

The drawer must render alongside the existing celebration UI, not replace it. It must not block the user from navigating away — the user can dismiss it and the lesson is already marked complete regardless.

Do not duplicate any Supabase logic. `QuickReflectionDrawer` handles the `pdp_reflections` insert and cycle resolution internally.

No other changes to the lesson viewer.

---

## Prompt F15-pre — Create storage buckets for PDP export

**Type:** Supabase migration — triggers the full DB change workflow from `handoffs/lovable-production-db-change.md` before running.

Create two new private Storage buckets via a Supabase migration:

**Bucket 1: `doc-templates`**
- `public = false`
- No `file_size_limit` (null — Vivacity staff upload templates manually; no browser upload path)
- No `allowed_mime_types` restriction
- RLS on `storage.objects` for this bucket:
  - SELECT: authenticated users (Edge Functions read templates using the service role key, so no browser RLS needed here — but add a policy so Vivacity staff can also browse via the dashboard): `is_vivacity_team_safe() = true`
  - INSERT / UPDATE / DELETE: `is_vivacity_team_safe() = true`
- `ON CONFLICT (id) DO NOTHING`

**Bucket 2: `generated-docs`**
- `public = false`
- `file_size_limit = 10485760` (10 MB)
- `allowed_mime_types`: `['application/vnd.openxmlformats-officedocument.wordprocessingml.document']`
- RLS on `storage.objects` for this bucket:
  - SELECT: document owner (path starts with `pdp/{auth.uid()}/`) OR Vivacity staff (`is_vivacity_team_safe()`) OR user is the cycle's `manager_id` (join `pdp_cycles`) OR user is a tenant admin for the relevant tenant (join `tenant_users`)
  - INSERT / DELETE: service role only (Edge Functions write here; no browser insert path needed)
- `ON CONFLICT (id) DO NOTHING`

No other schema changes.

**After this prompt ships:** manually upload the DOCX template to `doc-templates/pdp/pdp-cycle-export-v1.docx` before running F15. The Vivacity brand spec for the template is in `handoffs/pdp-lovable-prompts.md` under "Prompt 11 — Template authoring note".

---

## Prompt F15 — Edge Function: pdp-export (original Prompt 11, now executable)

**Type:** Edge Function deployment — no migration. Depends on F15-pre being live and the DOCX template uploaded.

Create `supabase/functions/pdp-export/index.ts` using the Deno Supabase client.

**Inputs (POST body, validated with zod):** `{ cycle_id: number }`

**Function logic:**

1. Validate the JWT. Bail with 401 unless the caller is the cycle owner, the cycle's `manager_id`, a tenant admin for the cycle's `tenant_id` (via `tenant_users`), or Vivacity staff (`is_vivacity_internal = true` on `users`).
2. Load: cycle row, audience row, all goals (with resolved `standards_reference` title and `framework`), all evidence items (with course/cert titles resolved via `academy_enrollments` and `academy_certificates`), all reflections (with lesson title resolved via `academy_lesson_progress → academy_lessons`), all reviews.
3. Render a DOCX using `npm:docx-templates`. Load the template from the `doc-templates` bucket at `pdp/pdp-cycle-export-v1.docx` using the service role key. If the template file is not found, return HTTP 503 with body `{ error: "Export template not yet uploaded. Contact Vivacity support." }` — do not crash.
4. Merge fields: `{{LearnerName}}`, `{{LearnerEmail}}`, `{{TenantName}}`, `{{AudienceLabel}}`, `{{CycleYear}}`, `{{CycleStartDate}}`, `{{CycleEndDate}}`, `{{TargetHours}}`, `{{ActualHours}}`, `{{PercentComplete}}`, `{{Goals}}` (table loop), `{{Evidence}}` (table loop), `{{Reflections}}` (table loop), `{{Reviews}}` (table loop), `{{IssuedAt}}`, `{{IssuedBy}}`.
5. Write the rendered DOCX to the `generated-docs` bucket at `pdp/{user_id}/{cycle_id}/cycle-export-{ISO_date}.docx` using the service role key.
6. Return a signed URL for the file, valid for 5 minutes (`createSignedUrl`).
7. Insert one `audit_log` row recording the export (action: `pdp_export`, entity_type: `pdp_cycles`, entity_id: `cycle_id`, actor_id: `auth.uid()`).

**Idempotency:** if a file already exists at the same path for today's date, overwrite it (the signed URL for the new version is what matters).

Use `_shared/cors.ts` and `_shared/supabase-client.ts` for CORS and the Supabase client. Do not inline these.

---

## Prompt F16 — ZIP audit pack for tenant admin (completes Prompt 12)

**Type:** UI only — no migration. Depends on F15 being live.

Open `src/pages/client/StaffPdpsPage.tsx`.

Add `jszip` to the project dependencies if not already present.

Replace the existing "Export audit pack" button handler (currently CSV-only) with a real ZIP implementation:

1. On click, show a `shadcn Progress` bar indicating bundle progress. Disable the button for the duration.
2. Iterate over the currently filtered staff rows (respect whatever filters the user has active — tenant, audience, currency status, cycle year).
3. For each staff member's `cycle_id`, call the `pdp-export` Edge Function (`/functions/v1/pdp-export`) with `{ cycle_id }` in the body, using the user's current session JWT in the `Authorization` header.
4. Fetch the DOCX from the returned signed URL and add it to a JSZip archive as `{staff_name}-pdp-{cycle_year}.docx` (slugify the staff name: lowercase, spaces to hyphens, strip special chars).
5. If any individual export call fails (non-200, network error, or missing signed URL), log the failure to console, skip that staff member, and continue — do not abort the whole bundle.
6. Generate the ZIP as a Blob and trigger a browser download named `audit-pack-{tenant-name}-{YYYY-MM-DD}.zip`.
7. On completion, show a toast: "Audit pack ready — X of Y staff exported." If any failed, add "Z exports failed — check console for details." in the toast description.
8. Re-enable the button and clear the progress bar.

Do not change the separate "Export CSV" button — it should remain unchanged.

---

## Done-when checklist (follow-up scope only)

- [ ] A regular user (non-Vivacity staff) can create a new PDP cycle from the "Start your PDP cycle" CTA without an RLS error
- [ ] A regular user can close their own active cycle; status changes to `'completed'` without an RLS error
- [ ] PDP appears in the Academy sidebar under "My Courses" on the `/academy/*` layout
- [ ] Completing a lesson triggers `QuickReflectionDrawer`; skip works; save inserts a `pdp_reflections` row with `lesson_progress_id`
- [ ] `doc-templates` and `generated-docs` storage buckets exist in Supabase
- [ ] "Audit-ready export" button in `/academy/pdp/cycle/[cycleId]` returns a signed DOCX URL (or a clear 503 if the template is not yet uploaded)
- [ ] Tenant admin "Export audit pack" in `/client/staff-pdps` produces a downloadable ZIP with one DOCX per staff member
