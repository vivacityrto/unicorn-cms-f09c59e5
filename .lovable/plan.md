# L10 agenda fixes (A, B, C)

## A + B — Migration (single file)

### Data update on `eos_agenda_templates`
For every row where `meeting_type = 'L10'` AND `is_archived = false`, apply a single `UPDATE` that rewrites `segments` via a `jsonb` walk:

- **Conditional swap (directional)**: Swap positions of the elements whose `name` is `"IDS (Identify, Discuss, Solve)"` and `"Customer/Employee Headlines"` **only when** both exact names are present **AND** the current ordinal of `IDS (Identify, Discuss, Solve)` is **strictly less than** the ordinal of `Customer/Employee Headlines`. If Headlines already precedes IDS, skip the swap for that row (no-op).
- **Rename**: Element whose `name` is exactly `"Conclude"` becomes `"Conclude / One Phrase Close"`.
- All other segment fields (`duration`, `description`, plus position of non-matching elements) preserved.

Implementation: per-row CTE that:
1. Expands `segments` with `jsonb_array_elements WITH ORDINALITY` to compute `v_ids_ord` and `v_headlines_ord`.
2. Rebuilds the array with `jsonb_agg(... ORDER BY ord)`, applying:
   - swap mapping `ord → (v_headlines_ord when ord = v_ids_ord, v_ids_ord when ord = v_headlines_ord, else ord)` — **only if** `v_ids_ord IS NOT NULL AND v_headlines_ord IS NOT NULL AND v_ids_ord < v_headlines_ord`; otherwise identity mapping.
   - rename via `CASE WHEN elem->>'name' = 'Conclude' THEN jsonb_set(elem,'{name}','"Conclude / One Phrase Close"') ELSE elem END`.
3. Single `UPDATE … SET segments = …` per row.

Verified counts: 389 L10 active templates, 388 contain both swap targets, 389 contain a `Conclude` segment. The 3 rows already in correct order will keep their order; rename still applies.

### `seed_system_agenda_templates()` — both overloads CREATE OR REPLACE
Two overloads exist (`()` and `(p_tenant_id bigint)`). Both updated so the L10 template they seed uses the exact final order and names:

```
Segue (5) → Scorecard (5) → Rock Review (5) →
Customer/Employee Headlines (5) → IDS (Identify, Discuss, Solve) (60) →
To-Do List (5) → Conclude / One Phrase Close (5)
```

All non-L10 templates (Quarterly, Annual, Same_Page) preserved verbatim. L10 segment descriptions preserved where present.

### Not touched
- `eos_meeting_segments` (historical meeting records).
- Any other template type.
- RLS policies.

## B — Frontend: `src/components/eos/AgendaTemplateEditor.tsx`
Replace `DEFAULT_SEGMENTS.L10` (lines 22–30) with the seven entries in the exact required order and names. Other meeting-type defaults untouched.

## B — Frontend: `src/components/eos/LiveMeetingView.tsx` (rename only)
Line 662: literal heading text `Conclude` → `Conclude / One Phrase Close`. Line 355 detection logic untouched.

## C — Frontend: `src/components/eos/LiveMeetingView.tsx` (todo assignee)
Mirror the existing `ownerIds` / `rockOwners` pattern (lines 82–104) for todos:

1. `todoOwnerIds = useMemo(...)` — distinct non-empty `owner_id` values from `todos`.
2. `const { data: todoOwners } = useQuery({ queryKey: ['todo-owners', todoOwnerIds], ... })` — identical shape to `rockOwners`, fetches `user_uuid, first_name, last_name` from `users`, returns `Record<string,string>` name map, `enabled: todoOwnerIds.length > 0`.
3. In the todo card (`'todos'` case, around line 608), add below the due-date `<p>`:
   ```
   <p className="text-xs text-muted-foreground">
     Assigned to: {todo.owner_id ? (todoOwners?.[todo.owner_id] ?? 'Unassigned') : 'Unassigned'}
   </p>
   ```

No other files changed. No migration for fix C.
