## Goal

Build `EvidenceSheet.tsx` for create + edit on `pdp_evidence_items`, add the `academy-evidence` storage bucket with proper RLS, and surface an Academy course/certificate picker for `academy_completion` / `academy_certificate` types.

## Discovery — gaps & deviations from the prompt

These are deliberate corrections; the prompt assumes a few things that don't match the live DB. Calling each out so we don't ship a broken feature.

1. **Column name**: DB has `is_formal` (not `is_formal_pd`). The form field will be labelled "Formal PD" but write to `is_formal`. The zod field will be named `is_formal` to keep the mapping 1:1.
2. **`standard_id` is not a column on `pdp_evidence_items`** (the column lives on `pdp_goals`). Two options:
   - **(A) Skip the StandardsPicker on evidence** — keep the schema as-is. Standards link via the chosen `goal_id`.
   - **(B) Migration to add `standard_id uuid REFERENCES standards_reference(id)`** so evidence can be tagged independently of a goal.
   - **Recommended: B**, because the prompt explicitly asks for it and standards-tagged evidence is required for audit-ready exports later. Migration is additive and nullable, so it's backward-compatible.
3. **`useLogEvidence(cycleId)` already exists** in `src/features/pdp/hooks.ts` (line 201). Will reuse it — only adding a new `useUpdateEvidence(cycleId)` for edit mode and a `useUserAcademyEnrollments(userId)` query hook.
4. **`logEvidence` doesn't stamp `created_by`** today. Will extend it (and the new updater) to set `created_by = auth.uid()` on insert for audit-trail completeness. No breaking change for existing callers (they don't pass it).
5. **`external_url` zod chain** in the prompt has an order issue. Use `z.union([z.literal(""), z.string().trim().url()]).optional().nullable()`.
6. **ULID not installed**. Use `crypto.randomUUID()` for the filename token. Keep the storage path scheme `pdp/{user_id}/{cycle_id}/{uuid}-{safeName}`.
7. **Trainer-only switch**: `is_industry_currency` is only meaningful when the cycle's `audience_code = 'trainer'`. Need to read the cycle's audience — pass it in via prop or fetch via existing `useCycle(cycleId)`. Will fetch via `useCycle` to keep the component self-contained.

## Files

### New: `supabase/migrations/<ts>_pdp_evidence_bucket_and_standard.sql`

- `INSERT INTO storage.buckets` for `academy-evidence` — `public=false`, `file_size_limit=10485760`, `allowed_mime_types` = `application/pdf, image/png, image/jpeg, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/msword`. Use `ON CONFLICT (id) DO NOTHING` for idempotency.
- 4 RLS policies on `storage.objects` scoped to `bucket_id='academy-evidence'`:
  - **insert** — `auth.uid()::text = (storage.foldername(name))[2]` AND first folder is literal `'pdp'`. Owner can only upload under `pdp/<their uid>/…`.
  - **select** — same owner check OR Vivacity internal staff (`is_vivacity_team_safe(auth.uid())`) OR tenant admin via `pdp_cycles.tenant_id` lookup that matches `(storage.foldername(name))[3]::bigint` against the cycle id (we look up the cycle from filename's third folder which holds `cycle_id`).
  - **update** — owner only.
  - **delete** — owner OR superadmin.
- Additive column: `ALTER TABLE public.pdp_evidence_items ADD COLUMN IF NOT EXISTS standard_id uuid REFERENCES public.standards_reference(id) ON DELETE SET NULL;` plus `CREATE INDEX IF NOT EXISTS idx_pdp_evidence_standard ON public.pdp_evidence_items(standard_id);`
- No trigger/policy changes elsewhere. Existing `pdp_evidence_items` RLS continues to govern row access.

### Edit: `src/features/pdp/api.ts`

- `logEvidence`: pull `auth.uid()` and set `created_by` if not provided.
- New `updateEvidence(input: UpdateEvidenceInput)` — partial update by id.
- New `signEvidenceDocument(path: string)` helper wrapping `supabase.storage.from('academy-evidence').createSignedUrl(path, 60)`.
- New `listUserAcademyEnrollments(userId)` — queries `academy_enrollments` joined to `academy_courses(title, estimated_minutes)` and `academy_certificates(id, certificate_number)` filtered by `status='completed'` and `user_id`.

### Edit: `src/features/pdp/hooks.ts`

- Already exports `useLogEvidence(cycleId)` — reuse.
- Add `useUpdateEvidence(cycleId)` — same invalidation pattern.
- Add `useUserAcademyEnrollments(userId)` query hook keyed `["pdp","user-academy-enrollments", userId]`.

### New: `src/features/pdp/components/EvidenceSheet.tsx`

#### Props (matches prompt verbatim)

```ts
interface EvidenceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  evidenceItem?: PdpEvidenceItem | null;
}
```

#### Behaviour

- `useIsMobile()` → `side="bottom"` mobile, `side="right"` desktop, `max-h-[90vh] overflow-y-auto`.
- `useCycle(cycleId)` to read `audience_code` for the trainer-only switch.
- `react-hook-form` + `zodResolver`, defaults reset on open via the same `useEffect(open, evidenceItem)` pattern from `GoalSheet`.

#### Field map and conditional logic

| Field | Visible when | Notes |
|---|---|---|
| `evidence_type` | always | `Select` w/ icon next to each item from the icon map |
| `goal_id` | always | `Select`, options from `useGoals(cycleId)`, `__none__` sentinel for null |
| `standard_id` | always | `StandardsPicker`, `allowClear` |
| **Academy-only block** | `evidence_type ∈ {academy_completion, academy_certificate}` | Course/cert picker (see below). Replaces title/description/duration/provider/url/upload |
| **Manual block** | otherwise | Renders title, description, duration_hours, external_provider (only for `external_course/workshop/conference`), external_url, document upload |
| `occurred_on` | always | shadcn date picker, ISO date string |
| `is_formal` | always | `Switch`, default `true` |
| `is_industry_currency` | `audience_code === 'trainer'` | `Switch`, default `false` |

#### Academy picker

- Uses `useUserAcademyEnrollments(currentUserId)` filtered to `status='completed'`.
- Each option shows `course.title` + completion date.
- On select: prefill `title` (`course.title`), `duration_minutes` (`course.estimated_minutes`), `occurred_on` (`enrollment.completed_at` date portion).
- Sets `source_enrollment_id` (always) and `source_certificate_id` (when `evidence_type='academy_certificate'` and a cert row exists for the enrollment).
- Hidden manual fields are omitted from the payload.

#### File upload spec

- Input: `<Input type="file" accept="application/pdf,image/png,image/jpeg,.docx,.doc">`.
- On submit: if a file is selected, `supabase.storage.from('academy-evidence').upload(path, file, { upsert: false, contentType: file.type })` where `path = pdp/{auth.uid()}/{cycleId}/{crypto.randomUUID()}-{safeName}` (`safeName` strips non `[A-Za-z0-9._-]`).
- Store `path` in `document_path`. If upload fails, abort the row write.
- Edit mode: if `evidenceItem.document_path` exists, render a "View document" button → calls `signEvidenceDocument(path)` and opens the signed URL in a new tab. Replacing a file uploads a new one but does not delete the old (history-preservation; we can wire deletion in a later cleanup pass).

#### Validation (zod)

```ts
const schema = z.object({
  evidence_type: z.enum([
    "academy_completion","academy_certificate","external_course","workshop",
    "industry_placement","validation_activity","community_of_practice",
    "conference","mentoring","reading","audit_response","other",
  ]),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  occurred_on: z.string().min(1, "Date is required"),
  duration_hours: z.coerce.number().min(0).max(999).optional().nullable(),
  is_formal: z.boolean(),
  is_industry_currency: z.boolean(),
  goal_id: z.coerce.number().int().positive().optional().nullable(),
  standard_id: z.string().uuid().optional().nullable(),
  external_provider: z.string().trim().max(200).optional().nullable(),
  external_url: z.union([z.literal(""), z.string().trim().url("Must be a valid URL")])
    .optional().nullable(),
  source_enrollment_id: z.coerce.number().int().positive().optional().nullable(),
  source_certificate_id: z.coerce.number().int().positive().optional().nullable(),
});
```

#### Submit

- Map `duration_hours` → `duration_minutes = Math.round(hours*60)` (nullable).
- Coerce empty strings → null.
- Call `useLogEvidence().mutate(...)` for create or `useUpdateEvidence().mutate(...)` for edit.
- On success: invalidate `["pdp","evidence",cycleId]` + `["pdp","cycle-summary",cycleId]` (already handled by hooks), `toast.success`, close sheet.
- On error: `toast.error(err.message ?? "Failed to save evidence")`, sheet stays open.
- Submit button disabled while `isPending`, label "Saving…".

#### Out of scope

- Replacing `src/components/academy/pdp/AddEvidenceSheet.tsx` placeholder — wiring happens in a later prompt.
- Deleting old uploaded files when replaced.
- Evidence verification flow (`verified_by` / `verified_at`).

## Risk assessment

- **DB migration**: additive only — new bucket + new nullable column + new RLS policies. No alters to existing rows, triggers, or policies. Backward-compatible.
- **RLS surface**: New storage policies are tightly scoped (`bucket_id='academy-evidence'` AND folder check). Cannot leak into `task-evidence`, `compliance-evidence`, or `academy-certificates`. Existing buckets untouched.
- **`logEvidence` change**: Adding `created_by` default is additive; no caller relies on it being null.
- **Types regen**: Adding `standard_id` requires Supabase types refresh after migration approval — handled automatically by the platform.
- **Performance**: New index on `standard_id`; user-enrollment query is small (per-user, completed only).
- **Audit completeness**: `created_by` populated, `document_path` immutable history (no destructive replace), Standards link captured at evidence level.
- **Failure modes considered**: oversized file (caught by `file_size_limit`), wrong MIME (caught by bucket allowed_mime_types), missing storage path (sheet shows nothing — no broken signed URL), browser without `crypto.randomUUID` (modern Vite target; fallback to `Date.now()+Math.random()` if needed).

## Summary

- 1 migration: `academy-evidence` bucket + 4 storage policies + `pdp_evidence_items.standard_id` column + index.
- 1 new component: `EvidenceSheet.tsx` covering 12 evidence types, conditional academy picker, signed-URL document viewer, trainer-only currency switch.
- 3 new API helpers, 2 new hooks, 1 small backward-compatible tweak to `logEvidence`.
- No edits to existing Academy code, no edits to `pdp_evidence_items` RLS, no `any` types.
