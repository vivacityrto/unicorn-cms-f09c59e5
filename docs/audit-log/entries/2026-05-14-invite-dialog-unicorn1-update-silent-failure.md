# Audit: 2026-05-14 — `InviteUserDialog` Unicorn-1 mapping update silently fails (discovery)

**Trigger:** Mystery flagged during the morning's `unicorn1."U1_XeroURL"` audit. The `InviteUserDialog` frontend issues `(supabase as any).schema('unicorn1').from('users').update(...)` directly via the user's anon-key Supabase client. The morning's verification showed `authenticated` has zero grants on `unicorn1`, raising the question: how does this call ever succeed? Parked as "InviteUserDialog schema-USAGE mystery". This session traced it and found: **the call has been silently failing in production since it shipped**. Discovery audit only — no fix shipped this session.
**Author:** Carl
**Scope:** Read-only investigation. No DB changes. No code changes. Documents the discovery, the root cause, the user-facing impact, the workaround the team has been using (batch backfill migrations), and the two clean fix options for a future focused session.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The call at `src/components/InviteUserDialog.tsx:185-189` is silently failing in production.** Code:

  ```ts
  if (data?.user_uuid) {
    await (supabase as any)
      .schema('unicorn1')
      .from('users')
      .update({ mapped_user_uuid: data.user_uuid })
      .eq('ID', u.ID);
  }
  ```

  Two problems combine to make this silently broken:
  1. **No `{ data, error }` destructuring or error check.** `supabase-js` does not throw on PostgREST errors — it returns `{ data, error }`. The `await` resolves successfully with `error` populated. The error is discarded.
  2. **`authenticated` has zero grants on `unicorn1`.** Verified live: `USAGE` on schema = `false`, `UPDATE` / `SELECT` on `unicorn1.users` = `false`. The call returns a permission error from PostgREST that the frontend never sees.

- **`unicorn1.users` RLS is *disabled*.** It's not the gate; the schema-grant denial is. Even if RLS were turned on with permissive policies, the call would still fail because `authenticated` cannot reach the schema at all.

- **The user-facing impact is real and concrete.** Migration `20260223223935_*.sql` line 38 reveals an RPC pattern:

  ```sql
  AND (NOT p_unmapped_only OR u.mapped_user_uuid IS NULL)
  ```

  …which means the dialog's search has an "unmapped only" mode. When a Vivacity admin imports a legacy Unicorn-1 user via the dialog:
  1. The `invite-user` edge function creates the new user successfully (service-role; works)
  2. The follow-up `.schema('unicorn1').from('users').update(...)` silently fails
  3. `unicorn1.users.mapped_user_uuid` stays NULL
  4. Next time the dialog searches with `unmapped_only=true`, the same legacy user appears again
  5. Risk: duplicate import attempts (idempotency depends on whether the invite-user edge function detects the existing public.users record — out of scope here to verify but worth confirming)

- **The team has noticed and worked around it manually.** Two past migrations did batch backfills:
  - `20260217195949_*.sql` — `UPDATE unicorn1.users SET mapped_user_uuid = pu.user_uuid FROM public.users pu WHERE u1.mapped_user_uuid IS NULL`
  - `20260217202605_*.sql` — same pattern, second pass

  Both are dated 17 Feb 2026. Someone (Carl most likely) noticed the per-import update wasn't sticking and ran bulk fixes. This confirms the bug has been present and known *operationally*, just not reported as a discrete bug.

- **`search-unicorn1-users` edge function works correctly.** It's the read path; uses service-role internally and reads `unicorn1.users` fine. So the search half of the dialog works; only the mark-as-mapped write half is broken.

- **`mapped_user_uuid` column is real and populated.** `information_schema.columns` confirms the column exists. The two backfill migrations have presumably populated rows from earlier imports. The current count of NULL vs non-NULL would tell us how many in-flight imports are at risk of duplication — out of scope to query in a read-only audit, but worth measuring before any fix ships.

---

## DB changes shipped

None. Read-only investigation.

---

## Code changes shipped

None. Recommended fix is parked.

---

## KB changes shipped

None. Worth a KB note on the canonical pattern for cross-schema writes from the frontend (don't — route through RPCs or edge functions) — surfaced as an open question below.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start: `2ec20216`. No commits this session.

Frontend file: `src/components/InviteUserDialog.tsx`
- L36: type declaration includes `mapped_user_uuid: string | null` (correct)
- L123-147: search effect calls `supabase.functions.invoke('search-unicorn1-users', ...)` — service-role path, works
- L150-200: `handleImportUser` — the import flow
  - L166-178: invokes `invite-user` edge function (service-role; works correctly)
  - L184-190: the broken update — no error check, no grants

Edge functions in the same family:
- `supabase/functions/search-unicorn1-users/` — read path (works)
- `supabase/functions/import-unicorn1-client/` — separate flow for client tenants (not user mappings)
- `supabase/functions/lookup-unicorn1-client/` — lookup helper (not user mappings)

---

## Recommended fix (parked for focused session)

Two options:

**Option A — new SECURITY DEFINER RPC**

```sql
CREATE OR REPLACE FUNCTION public.mark_unicorn1_user_mapped(
  p_unicorn1_id bigint,
  p_mapped_user_uuid uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verify caller is SuperAdmin (legacy import is a privileged action)
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only Super Admins can mark Unicorn-1 user mappings';
  END IF;

  UPDATE unicorn1.users
  SET mapped_user_uuid = p_mapped_user_uuid
  WHERE "ID" = p_unicorn1_id;
END;
$$;
```

Frontend changes `.schema('unicorn1').from('users').update(...)` to `supabase.rpc('mark_unicorn1_user_mapped', {...})` with proper error check.

Matches the project's existing pattern (the codebase already has `import-unicorn1-client`, `lookup-unicorn1-client`, and other SECURITY DEFINER paths for legacy-schema access).

**Option B — fold into `invite-user` edge function**

When `invite-user` is called with a `legacy_unicorn1_id` parameter (new optional input), it does the mapping update internally before returning. Frontend stops needing to make the second call.

Architecturally cleaner (atomicity + one less round trip), but expands `invite-user`'s contract. The current `handleImportUser` flow could pass `legacy_unicorn1_id: u.ID` in the body, and the edge function appends the unicorn1 UPDATE before returning.

**My recommendation if asked**: Option B for cleaner architecture; Option A if minimizing change surface is preferred.

---

## Decisions

- **Discovery audit only this session.** The actual fix deserves a focused Lovable session — Option A is ~30 min (Lovable DB session + small frontend edit), Option B is ~45 min (edge function update + frontend edit). Neither is in the rhythm of this session's small-step closures.
- **No KB note yet.** Could add a `pinned/conventions.md` rule about "frontend direct PostgREST writes to non-public schemas are forbidden — route through RPCs or edge functions" but that's a one-instance precedent so far. Wait for a second instance before codifying.

---

## Open questions parked

- **Fix the bug** — pick Option A or B and ship in a focused session. Bug priority assessment depends on how often the legacy-import dialog is used in production today. If it's actively used, this is HIGH (duplicate import risk + manual workaround burden). If it's rarely used, MEDIUM (data integrity gap).
- **Audit `unicorn1.users.mapped_user_uuid` IS NULL count.** Compare to the count of users that have been imported via the dialog (e.g. cross-reference `public.users` records created via the invite-user path). The delta is the size of the in-flight problem before the next manual backfill.
- **Other similar cross-schema writes from frontend?** Worth a grep for `.schema(` across `src/**` — anything else hitting non-public schemas directly is suspect.
- **`unicorn1.users` RLS is OFF, 0 policies.** Pre-flight finding from this session. Not a real exposure because `authenticated` has no schema USAGE, but the `tenant_rto_scope_staging` morning audit established that explicit deny-all policies in this situation is more honest than relying on grant-level denial alone. Worth a future cleanup pass on `unicorn1.*` to either disable RLS uniformly or add explicit deny-all to the few tables that have it on.
- **Comprehensive cross-schema-write audit.** This bug class (frontend writing to a non-public schema via PostgREST direct table calls) could recur anywhere a developer reflexively reaches for `.schema('X').from('Y')`. Worth a single grep + audit.

---

## Tag

`audit-2026-05-14-invite-dialog-unicorn1-update-silent-failure`
