
# Unicorn 2.0 Optimisation Plan

## Executive Summary

This plan addresses six key areas to improve Unicorn 2.0's security posture, performance, reliability, and maintainability. Each phase is designed to be independently deployable with minimal risk.

---

## Phase 1: Security — Harden Remaining Permissive RLS Policies

### Current State
The security linter identified 40+ policies using `USING (true)` or `WITH CHECK (true)`. These fall into two categories:

| Category | Tables | Action Required |
|----------|--------|-----------------|
| **Lookup/Reference Data** | `packages`, `ctstates`, `dd_status`, `labels`, `timezone_options`, `course_cache`, `qualification_cache`, `rto_cache`, `skillset_cache`, `place_holders`, `dd_address_type`, `dd_document_categories`, `dd_fields`, `package_type_thresholds`, `package_stage_map`, `eos_issue_status_transitions` | **Acceptable** — These are read-only reference tables where `USING (true)` for SELECT is appropriate. Write operations already require SuperAdmin. |
| **System/Audit Tables** | `email_automation_log`, `oauth_states`, `notification_schedule`, `email_link_audit`, `eos_minutes_audit_log`, `package_workflow_logs` | **Needs Review** — Some permissive INSERT/UPDATE policies exist for system processes. |

### Recommended Changes

1. **`email_automation_log`** — Currently allows any authenticated user to INSERT/UPDATE. Restrict to `is_vivacity_team_safe()` or service-role only.

2. **`oauth_states`** — Intentionally permissive for OAuth flow (service-role bypasses RLS anyway). Add documentation comment to clarify this is by design.

3. **`notification_schedule`** — `ALL` with `USING (true)` is overly broad. Restrict management to staff.

4. **Audit tables** (`email_link_audit`, `eos_minutes_audit_log`, `package_workflow_logs`) — INSERT with `WITH CHECK (true)` is acceptable for system logging, but add comments documenting the intent.

### Estimated Effort
2-3 hours (single migration with policy updates)

---

## Phase 2: Performance — Add Database Indexes

### Current State
The `document_instances` table has **106,146 rows** but only a primary key index. Common query patterns filter by `tenant_id`, `stage_instance_id`, `status`, and `created_at`.

### Recommended Indexes

```text
┌─────────────────────────────────────────────────────────────────┐
│ document_instances                                              │
├─────────────────────────────────────────────────────────────────┤
│ idx_document_instances_tenant_id         → tenant_id            │
│ idx_document_instances_stage_instance    → stage_instance_id    │
│ idx_document_instances_status            → status               │
│ idx_document_instances_created_at        → created_at DESC      │
│ idx_document_instances_tenant_status     → (tenant_id, status)  │
└─────────────────────────────────────────────────────────────────┘
```

### Additional Index Candidates
Review these high-traffic tables for similar patterns:
- `stage_instances` (tenant_id, status)
- `client_task_instances` (tenant_id, assigned_to)
- `time_entries` (user_id, created_at)

### Estimated Effort
1 hour (migration with CREATE INDEX CONCURRENTLY)

---

## Phase 3: Query Caching — Standardise React Query Configuration

### Current State
`staleTime` values are inconsistent across 17+ hooks:
- `Infinity` for enum/options (correct)
- `5 minutes` for user lists (reasonable)
- `30 seconds` for real-time data (reasonable)
- `2 minutes`, `1 hour`, `10 seconds` scattered inconsistently

### Recommended Approach

Create a central configuration file:

```text
src/lib/queryConfig.ts
├── QUERY_STALE_TIMES
│   ├── STATIC       → Infinity     (enums, options, frameworks)
│   ├── PROFILE      → 5 * 60 * 1000  (user/tenant profiles)
│   ├── LIST         → 2 * 60 * 1000  (team members, documents)
│   ├── REALTIME     → 30 * 1000      (timers, notifications)
│   └── DASHBOARD    → 60 * 1000      (aggregated metrics)
```

### Migration Strategy
1. Create `src/lib/queryConfig.ts` with standardised constants
2. Update existing hooks to import from this file
3. Document guidelines in a code comment for future hooks

### Estimated Effort
2-3 hours (create config + update 17 files)

---

## Phase 4: Reliability — Implement Global Error Boundary

### Current State
No `ErrorBoundary` component exists. React rendering errors crash the entire application with no recovery path.

### Recommended Implementation

```text
src/components/ErrorBoundary.tsx
├── Catches React rendering errors
├── Displays user-friendly fallback UI
├── Logs errors to audit_events table (optional)
├── Provides "Reload" and "Go to Dashboard" recovery options
└── Shows error details in development mode only
```

### Integration Point

```text
App.tsx
├── QueryClientProvider
│   └── TooltipProvider
│       └── BrowserRouter
│           └── AuthProvider
│               └── ErrorBoundary  ← NEW (wrap here)
│                   └── TenantTypeProvider
│                       └── ... (rest of providers)
```

### Estimated Effort
2 hours (component + App.tsx integration)

---

## Phase 5: Maintainability — Edge Function Consolidation

### Current State
- 48 Edge Functions in `supabase/functions/`
- Shared utilities exist in `_shared/` (3 files: `addin-auth.ts`, `cors.ts`, `graph-client.ts`)
- CORS headers in `_shared/cors.ts` are missing newer Supabase client headers

### Recommended Improvements

1. **Update CORS headers** in `_shared/cors.ts`:
```text
Current:  'authorization, x-client-info, apikey, content-type'
Updated:  + 'x-supabase-client-platform, x-supabase-client-platform-version, 
            x-supabase-client-runtime, x-supabase-client-runtime-version'
```

2. **Consolidate common patterns** into `_shared/`:
   - `supabase-client.ts` — Standard client initialisation
   - `auth-helpers.ts` — JWT validation and user extraction
   - `response-helpers.ts` — Standardised JSON response formatting
   - `error-handlers.ts` — Consistent error response structure

3. **Audit functions for duplication** — Many functions likely duplicate Supabase client setup and error handling

### Estimated Effort
4-6 hours (audit + consolidation)

---

## Phase 6: Test Coverage Expansion

### Current State
Tests exist only in `src/test/eos/` (6 test files covering meetings, rocks, and related EOS functionality). No coverage for:
- Authentication flows
- RBAC enforcement
- Package lifecycle
- Tenant isolation
- Edge functions

### Recommended Test Suites

| Suite | Priority | Description |
|-------|----------|-------------|
| `src/test/auth/` | High | Login, logout, session persistence, password reset |
| `src/test/rbac/` | High | Role-based access for SuperAdmin, Team Leader, Team Member, Client Admin, Client User |
| `src/test/tenant/` | High | Tenant isolation, cross-tenant prevention |
| `src/test/packages/` | Medium | Package creation, assignment, workflow progression |
| `supabase/functions/*/index_test.ts` | Medium | Edge function unit tests |

### Estimated Effort
8-16 hours (depends on depth of coverage)

---

## Implementation Priority

| Priority | Phase | Impact | Effort | Risk |
|----------|-------|--------|--------|------|
| 1 | Security (Phase 1) | High | Low | Low |
| 2 | Performance (Phase 2) | Medium | Low | Low |
| 3 | Error Boundary (Phase 4) | Medium | Low | Low |
| 4 | Query Config (Phase 3) | Low | Medium | Low |
| 5 | Edge Functions (Phase 5) | Medium | Medium | Low |
| 6 | Test Coverage (Phase 6) | High | High | None |

---

## Technical Notes

### Security Helper Functions Reference
All RLS policy changes should use the standardised helpers documented in `sql-setup/00-security-helpers-reference.sql`:
- `is_super_admin_safe(auth.uid())`
- `is_vivacity_team_safe(auth.uid())`
- `has_tenant_access_safe(tenant_id, auth.uid())`
- `has_tenant_admin_safe(tenant_id, auth.uid())`

### Database Migration Safety
- All index creations should use `CREATE INDEX CONCURRENTLY` to avoid table locks
- RLS policy changes should drop existing policies before creating new ones
- Migrations should be tested in a development environment first

