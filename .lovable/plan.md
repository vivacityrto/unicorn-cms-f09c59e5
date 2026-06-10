## Fix `useDashboardTriage.ts` query timeouts

Two query updates in `src/hooks/useDashboardTriage.ts` to prevent timeouts for non-Super-Admin staff against ~387 tenants.

### 1. Attention-ranked tenants query (lines 227-240)

Replace with view-aware filtering:

- SA → `.limit(500)`
- `my_tenants` view + has `profile.user_uuid` → `.eq('assigned_csc_user_id', profile.user_uuid).limit(200)`
- otherwise → `.limit(100)`
- `queryKey` becomes `['triage-attention-ranked', isSuperAdmin, savedView, profile?.user_uuid]`
- Order by `attention_score` desc preserved

### 2. Behavioural prompts query (lines 554-565)

- Add `.eq('owner_user_id', profile.user_uuid)` when `!isSuperAdmin && savedView === 'my_tenants' && profile?.user_uuid`
- `queryKey` becomes `['triage-behavioural-prompts', isSuperAdmin, savedView, profile?.user_uuid]`
- SA and `all_tenants` views unchanged (no extra filter)

No other changes — `isSuperAdmin`, `isVivacityStaff`, `savedView`, `profile` already in scope.