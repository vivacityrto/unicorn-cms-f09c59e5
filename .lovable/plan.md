## Phase 4 — Add `reporting_obligations` scope to `generate-notifications`

Extend `supabase/functions/generate-notifications/index.ts` with a third scope branch. Existing `meetings` and `tasks_obligations` paths are untouched.

### Dispatch

Parse JSON body and route on `scope === 'reporting_obligations'`:
- `{ scope }` → **scheduled** mode (cron path, service-role only).
- `{ scope, obligation_id, preview: true }` → **preview** mode.
- `{ scope, obligation_id, broadcast: true }` → **broadcast** mode.

Preview and broadcast require a caller JWT. Validate it with the anon-key client + `auth.getClaims(token)`, then check `public.is_super_admin_safe(claims.sub)` via the service-role client. Reject with 403 otherwise. Writes always use the service-role client; never returned to the caller.

### Shared core logic
1. `today_aest`: compute via `SELECT (now() AT TIME ZONE 'Australia/Sydney')::date` (single round trip).
2. Fetch from `public.v_client_reporting_reminders` (`select('*')`). In preview/broadcast, filter to the supplied `obligation_id`.
3. Exclude test tenants: fetch distinct `tenant_id`s from result, query `public.tenants` where `name ILIKE 'test%'`, build an exclusion `Set<bigint>`, drop matching view rows.
4. Lead-time filter (**scheduled only**): recompute `days_until` in AEST per row; keep when `days_until ∈ obligation.lead_times`, `=0`, or `=-1`. Drop `recurrence IN ('always_open','rolling_per_tenant')`. Broadcast mode skips this filter entirely.
5. Recipients per `(obligation_id, tenant_id)`: `public.tenant_users` where `relationship_role IN ('primary_contact','secondary_contact','user')` and `(access_scope IS NULL OR access_scope <> 'academy_only')`. Apply `fetchUserPrefs` and drop users whose `obligations` pref is `false`.
6. Build `user_notifications` rows:
   - `type = 'reporting_obligation_due'`
   - `title = obligation.title`
   - `message = obligation.notification_message?.trim() || obligation.description?.slice(0, 1000) || ''`
   - `link = obligation.cta_url`
   - `tenant_id`, `user_id` from step 5
   - `dedupe_key`:
     - scheduled: `reporting_obligation:{obligation_id}:{tenant_id}:{user_id}:{cycle_year}:lt{lead_window}` where `cycle_year = year(next_date)` and `lead_window` is the matched int, or `'overdue'` (-1) / `'due_today'` (0).
     - broadcast: `reporting_obligation:{obligation_id}:{tenant_id}:{user_id}:broadcast:{utc_minute_iso}` using `new Date().toISOString().slice(0,16)`.
7. Upsert in chunks of 500 into `public.user_notifications` with `{ onConflict: 'dedupe_key', ignoreDuplicates: true }`; return `{ inserted: totalCount }`.

### Preview mode
Run steps 1–5 only. Return `{ tenant_count, user_count, sample_tenants: string[≤10] }`. No upsert.

### Broadcast mode — audit row
After the upsert, insert one row into `public.audit_events` mapped to the existing schema:
- `entity = 'reporting_obligation'`
- `entity_id = gen_random_uuid()` (column is strict uuid; numeric obligation id lives in details)
- `action = 'broadcast'`
- `user_id = claims.sub`
- `details = { obligation_id, tenant_count, user_count, notifications_inserted }`

### Security / conventions
- No new SQL functions added in this phase, so no SQL grants needed.
- All Postgres references via the JS client are already schema-implicit `public.*`; the AEST-today query uses fully qualified `now() AT TIME ZONE 'Australia/Sydney'`.
- Service-role key only used inside the function; never returned/logged.
- Existing scopes left byte-identical.

### Verification (manual, after deploy)
1. Preview as super-admin (`obligation_id:1, preview:true`) → returns counts; `SELECT count(*) FROM user_notifications WHERE type='reporting_obligation_due'` unchanged.
2. Broadcast as super-admin (`obligation_id:1, broadcast:true`) → `{ inserted: N>0 }`; new notification rows present; one `audit_events` row with `entity='reporting_obligation'`, `action='broadcast'`, matching `details`.
3. Scheduled (`{ scope:'reporting_obligations' }`) → fires; repeat call returns `{ inserted: 0 }` (dedupe works).
4. `meetings` and `tasks_obligations` scopes unchanged in behavior.

### Out of scope
Phase 5 cron registration. Phase 6 frontend. No changes to existing scope handlers.
