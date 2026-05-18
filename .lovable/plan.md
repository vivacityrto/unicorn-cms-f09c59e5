
## Bug
Inserting an EOS to-do as a Vivacity staff user fails with `null value in column "tenant_id" of relation "eos_todos" violates not-null constraint`, because:
1. `src/hooks/useMeetingTodos.tsx` line 38 passes `profile?.tenant_id!` (null for staff).
2. `src/hooks/useEos.tsx` line 256 strips `tenant_id` from the insert payload entirely.

## Fix (two files, frontend only)

### 1. `src/hooks/useMeetingTodos.tsx`
Replace the insert payload's tenant assignment:
- From: `tenant_id: profile?.tenant_id!`
- To: `tenant_id: profile?.tenant_id ?? 6372`

### 2. `src/hooks/useEos.tsx` (createTodo mutation, ~line 254-265)
- Remove: `const { tenant_id, ...todoData } = todo;`
- Replace insert with:
  ```ts
  const insertData = { ...todo, tenant_id: todo.tenant_id ?? 6372 };
  const { data, error } = await supabase
    .from('eos_todos')
    .insert(insertData as any)
    .select()
    .single();
  ```

## What is NOT touched
- No RLS policy changes on `eos_todos`.
- No schema or migration changes.
- No changes to read queries (`useMeetingTodos` fetch, `useEos` todos query, PastMeetingSummary, Leadership/CEO dashboards).
- No changes to `updateTodo`, display, or routing logic.

## Backward compatibility / impact analysis
- **Client users**: `profile.tenant_id` is non-null, so `?? 6372` is a no-op — behaviour unchanged.
- **Vivacity staff (L10/internal meetings)**: previously broken; now persists with `tenant_id = 6372`, matching the existing convention used by Leadership/CEO dashboards and `useVivacityTeamUsers`. Reads already filter by `tenant_id = 6372` for these dashboards, so new rows surface correctly.
- **RLS**: `tasks_tenants_*` and EOS policies remain intact (last migration validated). Inserts by staff into tenant 6372 are already permitted by existing policies (same path used by other EOS staff writes).
- **Audit trail**: `created_at`/`updated_at` triggers and any audit hooks on `eos_todos` are unchanged; no data is rewritten.
- **EOS Todos page** (`EosTodos.tsx`): still reads via `useEos` which already branches `vivacity_team` vs tenant; new staff-created rows with tenant 6372 will appear in the staff branch.
- **PastMeetingSummary**: reads by `meeting_id`, independent of tenant — unaffected.
- **LiveMeetingView**: uses `useMeetingTodos` query keyed on `meeting_id` — unaffected.

## Risk assessment
- **Risk: low.** Two single-line changes in client hooks; no DB or auth surface touched.
- **Edge case**: a future caller of `useEos.createTodo` that genuinely needs a different tenant can still pass `tenant_id` explicitly — the fallback only fires when omitted.
- **Hardcoded constant `6372`**: already used elsewhere in the codebase as the canonical Vivacity tenant ID; acceptable per project memory.

## Verification plan
1. As Vivacity staff in LiveMeetingView: add a to-do → toast success, row appears, `tenant_id = 6372` in DB.
2. As Vivacity staff on EOS Todos page: add a to-do → same outcome.
3. As a client Admin user: add a to-do → row persists with the user's own `tenant_id` (unchanged).
4. Confirm Leadership/CEO dashboard counts increment for new staff-created to-dos.
5. Confirm existing todos still render in all four surfaces (Live, Past, EOS Todos page, dashboards).
