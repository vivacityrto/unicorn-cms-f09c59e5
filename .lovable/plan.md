## Goal
Three bugs in the Academy Course Builder (`/superadmin/academy/builder/:courseId`), all in the same component. Fix in one PR. The DB migration to `target_audience text[]` has already run; frontend types and queries still expect `text` and are throwing TS errors — those need realigning too.

## Bug 1 — Form changes never persist (controlled form + explicit Save)

**Cause.** `src/pages/superadmin/AcademyBuilderCourse.tsx` Course Settings panel uses `<Input defaultValue={course.x} onBlur={…autoSave}>` (uncontrolled). When the AI generator writes `short_description`/`description` straight to Supabase via `updateCourse.mutate(...)`, the inputs keep showing their initial `defaultValue` because `defaultValue` is read once. After navigating away and back, the refetched value briefly mounts but any AI-generated text written directly during the session never refreshes the visible input — and worse, when the user types something next and blurs, the autosave overwrites the AI text with the stale `defaultValue` content. Net effect: AI changes are lost.

**Fix in `src/pages/superadmin/AcademyBuilderCourse.tsx`:**

- Replace `defaultValue` with controlled `value` for all Course Settings fields: `title`, `slug`, `short_description`, `description`, `target_audience`, `difficulty_level`, `estimated_minutes`, `tags`, `is_free`, `certificate_enabled`, `pass_score`.
- Add a single `formState` `useState` initialised from the `course` query, plus a `useEffect` that resets `formState` whenever the underlying `course` changes (covers refetch after AI generation and after save).
- Track a `isDirty` boolean by comparing `formState` vs the last-loaded course snapshot (deep-equal of the watched fields).
- Remove the `autoSave` helper and per-field `onBlur` writes. Inputs only call `setFormState`.
- Add a single `useMutation` `saveCourseSettings` that does:
  ```ts
  supabase.from('academy_courses').update(payload).eq('id', courseId).select().single()
  ```
  with `payload` containing only the watched fields. On success: toast `"Course settings saved"`, `qc.invalidateQueries({ queryKey: ['academy-builder-course', courseId] })` and the admin courses list query, reset the snapshot so `isDirty` clears.
- Add a **Save Changes** button at the top-right of the Course Settings panel (inside the `<h2>` row), disabled when `!isDirty || saveCourseSettings.isPending`, with a `<Loader2 className="animate-spin" />` while pending.
- Beside it, render `Last saved {formatDistanceToNow(new Date(course.updated_at), { addSuffix: true })}` (import from `date-fns`, already a dep). Hide when no `updated_at`.
- Update `AiDescriptionGenerator`'s `onGenerated` callback to push values into `formState` (`setFormState(p => ({ ...p, short_description, description }))`) **instead of** calling `updateCourse.mutate(...)`. The user then sees changes and can click Save. (Keeps "explicit Save" guarantee, avoids race conditions.)
- Add unsaved-changes guard using React Router 6.4+ `useBlocker` (this project is on RR 6 — confirm in `package.json`; if `useBlocker` unavailable, fall back to `window.beforeunload`). Prompt: `"You have unsaved changes. Leave anyway?"`. Plus a `useEffect` registering `beforeunload` while `isDirty`.
- Keep existing per-field flows that aren't part of Course Settings unchanged: status transitions (`handlePublish`, `handleBackToDraft`, `archiveCourse`), module/lesson mutations, `Switch` for module `is_published`. They already mutate immediately and that's correct.

## Bug 2 — Free Course / Certificate Enabled toggles

Same root cause as Bug 1 — once Course Settings is fully controlled, the `Switch`es for `is_free` and `certificate_enabled` flow into `formState` and are persisted by Save Changes. No separate handler needed. The Pass Score input (visible when `certificate_enabled`) likewise reads from and writes to `formState`.

## Bug 3 — Pathways multi-select + Sub-categories chip input

### 3a. Single source of truth for pathways
Create `src/lib/academy/pathways.ts` exactly per spec:
```ts
export const ACADEMY_PATHWAYS = [
  { value: 'trainer',                  label: 'Trainer Hub',              icon: 'Users' },
  { value: 'compliance_manager',       label: 'Compliance Manager',       icon: 'ShieldCheck' },
  { value: 'governance_person',        label: 'Governance Person',        icon: 'Building2' },
  { value: 'student_support_officer',  label: 'Student Support Officer',  icon: 'HeartHandshake' },
  { value: 'administration_assistant', label: 'Administration Assistant', icon: 'ClipboardList' },
] as const;
export type PathwayValue = typeof ACADEMY_PATHWAYS[number]['value'];
```
Refactor existing hardcoded references to consume this constant:
- `src/components/layout/AcademyLayout.tsx` (left-nav)
- `src/components/academy/AudienceHubPage.tsx` and `getCourseCategory` helper
- `src/components/academy/admin/AudienceTags.tsx`
- `src/pages/client/TrainerHubPage.tsx`, `ComplianceManagerPage.tsx`, `GovernancePersonPage.tsx` (label text and any audience key constants)
- `src/pages/client/AcademyDashboardPage.tsx`
- `src/components/academy/admin/rules/RulesMatrixTab.tsx`, `RulesListTab.tsx`

(Touch only the pathway label/value list; don't restructure these files.)

### 3b. PathwayMultiSelect component
Create `src/components/academy/PathwayMultiSelect.tsx`. A vertical checkbox list (shadcn `Checkbox` + `Label`) showing all five pathways with their lucide icon. Props: `{ value: string[]; onChange: (next: string[]) => void; }`. Toggling a checkbox produces a new array (preserving stable order from `ACADEMY_PATHWAYS`).

In the builder, replace the `Target Audience` text input (line 230–232) with:
```tsx
<Field label="Pathways">
  <PathwayMultiSelect value={formState.target_audience ?? []} onChange={(v) => setFormState(p => ({ ...p, target_audience: v }))} />
</Field>
```
Publish-time validation only: in `handlePublish`, if `(formState.target_audience ?? []).length === 0`, toast `"Select at least one pathway before publishing"` and abort. Drafts can save with zero pathways.

### 3c. TagChipInput component (Sub-categories)
Create `src/components/academy/TagChipInput.tsx`. Use `cmdk` (already in the project via shadcn `Command`) + `Badge` — do NOT add `react-tag-input`. Props: `{ value: string[]; onChange: (next: string[]) => void; suggestions: string[]; }`. Behaviour:
- Render existing chips as removable `<Badge>` with an `×` button.
- Below: an `<Input>` with autocomplete dropdown driven by `suggestions` filtered by current input.
- Pressing Enter or clicking a suggestion adds the tag. Convert input to lower-kebab-case before adding (`v.trim().toLowerCase().replace(/\s+/g, '-')`). Skip duplicates and empties.
- Backspace on empty input removes the last chip.

Add `fetchDistinctAcademyTags` to `src/lib/academy/queries.ts` (create file if missing) per spec, and wrap with TanStack Query (`useQuery({ queryKey: ['academy-distinct-tags'], queryFn: fetchDistinctAcademyTags, staleTime: 5*60*1000 })`).

In the builder, replace the existing `Tags (comma-separated)` input with `<TagChipInput value={formState.tags ?? []} onChange={...} suggestions={distinctTags} />`. Save still happens through the Save Changes button.

### 3d. Type + query realignment for `text[]`
The current TS errors blocking the build:
- `src/hooks/useAcademyCourses.ts:12` and `:42` — change `target_audience: string | null` → `string[] | null`. Replace `.ilike("target_audience", '%${audienceKey}%')` with `.contains("target_audience", [audienceKey])`.
- `src/hooks/academy/useAdminAcademyCourses.ts:14` and `:49` — same type swap; same `.ilike` → `.contains` swap (with the filter value wrapped in an array).
- `src/hooks/academy/useAcademyPackageRules.ts:22` and `:72` — type swap. The `.select("id, title, target_audience, sort_order, status")` cast at line 72 is what triggers the build error; once the row type is `string[]` the `as CourseRow[]` cast is valid.
- `src/pages/superadmin/AcademyBuilderCourse.tsx:426` — `AssessmentEditorTab` prop `courseTargetAudience` currently typed `string`. Change to `string[] | null` and update the prop in `AssessmentEditorTab.tsx` to accept and render the joined label list (e.g. `targetAudience?.map(v => labelFor(v)).join(', ')`).
- `src/pages/superadmin/AcademyBuilderCourse.tsx:505` — payload spread carries the array as-is (Supabase client accepts `string[]` for `text[]` columns).
- Audience matching pages (`TrainerHubPage`, `ComplianceManagerPage`, `GovernancePersonPage`, `AudienceHubPage`'s `getCourseCategory`): wherever they currently do substring matching on `target_audience`, switch to `.contains('target_audience', [pathwayValue])` at the query layer or `arr.includes(pathwayValue)` at the helper layer.
- Regenerate Supabase types after migration approval to confirm `target_audience: string[] | null` lands in `src/integrations/supabase/types.ts` (do not hand-edit that file).

## Out of scope
Structure tab, Assessment tab, Package Rules tab internals, AI generator implementation, RLS, schema changes, EOS/L10/Audits.

## Acceptance
1. Edit Short Description on course `id=23`, Save, refresh → persists.
2. Toggle Free Course off, Save, refresh → persists.
3. Pathways shows five checkboxes, pre-populated from the array; change, save, refresh → persists.
4. Add `new-topic` chip in Sub-categories, save, refresh → persists in `tags`.
5. Course `id=1` "TAS Superhero" loads its migrated pathways and tags correctly.
6. Navigating away with unsaved changes → confirmation prompt.
7. Trainer Hub / Compliance Manager landing pages still list correctly filtered courses (now via `.contains`).
8. `bun run build` succeeds (the three pre-existing TS errors gone).