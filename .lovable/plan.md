# Frontend wiring: Vivacity Team Directory RPCs

## 1. `src/hooks/useVivacityTeamUsers.tsx`

- Replace the body of `useVivacityTeamUsers` queryFn:
  - Drop `supabase.from('users').select(...).in(...).eq(...).eq(...).order(...)`.
  - Call `supabase.rpc('get_vivacity_team_directory_staff')`.
  - Cast result as `VivacityTeamUser[]`.
- Keep `VivacityTeamUser` type unchanged (all 7 fields).
- Keep `queryKey: ['vivacity-team-users']` and `staleTime: QUERY_STALE_TIMES.PROFILE`.
- Add new exported type:
  ```ts
  export interface VivacityTeamDirectoryEntry {
    user_uuid: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  }
  ```
- Add new exported hook `useVivacityTeamDirectory` that calls `supabase.rpc('get_vivacity_team_directory')` with `queryKey: ['vivacity-team-directory']`, same `staleTime`. Not wired anywhere.
- Leave `useSystemTenantId` and `VIVACITY_TENANT_ID` untouched.

## 2. `src/pages/AuditTemplateBuilder.tsx`

- Delete the local `useVivacityTeamUsers` function (lines ~117–129).
- Add `import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';`.
- `VivacityTeamDropdownPreview` already destructures `data: users` — keeps working unchanged because the shared hook returns the same shape (`user_uuid, first_name, last_name, email, avatar_url, …`). The existing `{ value, label, email, avatarUrl, avatarFallback }` mapping at lines ~139–146 is preserved verbatim.

## 3. `src/components/audit/LiveInspectionDialog.tsx`

- Delete the local `useVivacityTeamUsers` function (lines 75–88).
- Add `import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';`.
- Existing `data: vivacityUsers` consumer and the `userOptions` mapping (lines 116–123) preserved exactly — fallback `... || user.email || 'Unknown'` keeps working.

## Out of scope

- No RLS, migration, or other file changes.
- No changes to other consumers — the shared hook's return shape is preserved.
