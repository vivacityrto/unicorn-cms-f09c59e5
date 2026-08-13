# Audit: 2026-08-13 — Facilitator names invisible to real clients (RLS gap)

**Trigger:** drift-surfaced
**Scope:** read path for `academy_courses.facilitator_id` → display name, used
by course cards (`AudienceHubPage.tsx`) and the lesson viewer's "Facilitator:"
label (`AcademyLessonViewerPage.tsx`). Not a broader review of `users` RLS.

## Findings

- Carl noticed no facilitator name rendering on any course card in the
  Compliance Manager pathway, live on prod, logged in as the real client
  demo account (`carl+demo@vivacity.com.au`, `is_vivacity_internal = false`,
  member of tenant 7547 "Demo RTO").
- Confirmed in the DB that `facilitator_id` was correctly set (mostly to
  Angela Connell-Richards) on the affected courses — the data was fine, the
  display was not.
- Root cause: `useFacilitatorNames` resolved names via a plain client-side
  `select` against `public.users`, which is RLS-scoped to: the querying
  user's own row, users in the querying user's own tenant (tenant admins
  only), or a user assigned as the querying tenant's CSC
  (`tenant_csc_assignments`). Angela is Vivacity staff and is CSC-assigned to
  several tenants (checked `tenant_csc_assignments`), but not to "Demo RTO"
  (7547) — so none of the `users` SELECT policies matched, the query
  silently returned zero rows, and every facilitator name resolved to
  `null`. This isn't specific to the demo tenant or the courses touched
  earlier today — it affects any client tenant where the facilitator isn't
  that tenant's own assigned CSC, i.e. most of them.

## Code changes

- New migration (`add_get_academy_facilitator_names_safe`): a
  `SECURITY DEFINER` SQL function,
  `public.get_academy_facilitator_names_safe(p_facilitator_ids uuid[])`,
  returning `(user_uuid, full_name)` — but only for a `user_uuid` that is
  *already* the `facilitator_id` of at least one `published` course. It
  cannot be used to look up an arbitrary user's name; it only ever surfaces
  a name that's already meant to be public on a course a client can see.
  Granted `EXECUTE` to `authenticated`.
- `useFacilitatorNames.ts`: now calls this RPC instead of selecting from
  `users` directly.
- `src/integrations/supabase/types.ts`: hand-added the new function's
  generated type entry (full `generate_typescript_types` output exceeded the
  tool's response size limit, so the relevant block was extracted and
  inserted manually rather than replacing the whole file).

## Decisions

- Chose a `SECURITY DEFINER` RPC scoped to "already-public course
  facilitator" over widening any `users` RLS SELECT policy, to avoid
  expanding read access to `users` in a way that could cross tenant
  boundaries for unrelated data.
- Carl confirmed before the migration was applied (blocked once by the auto
  mode permission classifier as a schema-adjacent change; re-confirmed via
  AskUserQuestion, then applied).

## Open questions parked

- Whether `AcademyBuilderLibrary.tsx` (superadmin-only, staff already pass
  `users_select_staff`) should also switch to the RPC for consistency — not
  actioned, no bug there today.
