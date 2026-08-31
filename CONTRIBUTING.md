# Contributing to Unicorn 2.0

This guide covers development standards, patterns, and conventions for the Unicorn 2.0 codebase.

---

## Table of Contents

1. [Project Architecture](#project-architecture)
2. [RBAC Patterns](#rbac-patterns)
3. [React Query Configuration](#react-query-configuration)
4. [Error Handling](#error-handling)
5. [Logging](#logging)
6. [Testing Standards](#testing-standards)
7. [Edge Function Development](#edge-function-development)
8. [Database Conventions](#database-conventions)
9. [Validation Patterns](#validation-patterns)

---

## Project Architecture

### Directory Structure

```
src/
├── components/           # React components
│   ├── ui/              # Reusable UI primitives (shadcn)
│   ├── layout/          # Layout components
│   └── [feature]/       # Feature-specific components
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions and configs
├── contexts/            # React context providers
├── pages/               # Route page components
├── integrations/        # External service integrations
│   └── supabase/        # Supabase client and types
└── test/                # Test files and fixtures

supabase/
├── functions/           # Edge functions
│   └── _shared/         # Shared utilities for edge functions
└── migrations/          # Database migrations
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `AuthenticatedLayout` | Wraps authenticated pages, selects layout by tenant type |
| `ErrorBoundary` | Global error catching with audit logging |
| `DashboardLayout` | Main navigation layout for compliance users |
| `AcademyLayout` | Layout for Academy platform users |

---

## RBAC Patterns

### Role Hierarchy

1. **Super Admin** - Vivacity internal staff with full access
2. **Team Leader** - Vivacity team leads with elevated access
3. **Team Member** - Vivacity staff members
4. **Admin** - Client organisation administrators
5. **General User** - Client staff members

### Using the useRBAC Hook

```typescript
import { useRBAC } from '@/hooks/useRBAC';

function MyComponent() {
  const { 
    isSuperAdmin, 
    isVivacityTeam, 
    hasTenantAccess,
    canAccessRoute 
  } = useRBAC();

  // Check Super Admin status
  if (isSuperAdmin) {
    // Show admin controls
  }

  // Check tenant access
  if (hasTenantAccess(tenantId)) {
    // Allow access to tenant data
  }

  // Check route permissions
  if (canAccessRoute('/eos/meetings')) {
    // Show EOS menu item
  }
}
```

### Permission-Gated Components

```typescript
// In component
const { isSuperAdmin } = useRBAC();

return (
  <div>
    <PublicContent />
    {isSuperAdmin && <AdminOnlyControls />}
  </div>
);
```

### Edge Function Permission Checks

```typescript
import { checkSuperAdmin, checkTenantAccess } from "../_shared/auth-helpers.ts";

// Require Super Admin
if (!checkSuperAdmin(profile)) {
  return jsonError(403, "FORBIDDEN", "Super Admin access required");
}

// Require tenant access
const hasAccess = await checkTenantAccess(supabase, user.id, tenantId);
if (!hasAccess) {
  return jsonError(403, "FORBIDDEN", "No access to this tenant");
}
```

---

## React Query Configuration

### Using Query Presets

Import presets from `src/lib/queryConfig.ts`:

```typescript
import { QUERY_PRESETS, QUERY_STALE_TIMES } from '@/lib/queryConfig';

// Use preset for common patterns
const { data } = useQuery({
  queryKey: ['users', userId],
  queryFn: fetchUser,
  ...QUERY_PRESETS.requirement,
});

// Or set staleTime directly
const { data } = useQuery({
  queryKey: ['documents'],
  queryFn: fetchDocuments,
  staleTime: QUERY_STALE_TIMES.requirement,
});
```

### Stale Time Tiers

| Tier | Duration | Use For |
|------|----------|---------|
| `realtime` | 0 | Live data (meetings, timers) |
| `requirement` | 30s | Core business data (documents, packages) |
| `navigation` | 2min | Navigation items (clients, menus) |
| `stable` | 5min | Reference data (templates, config) |
| `static` | 30min | Rarely changing data (standards, roles) |

### Example by Category

```typescript
// Real-time data (active timers, live meetings)
staleTime: QUERY_STALE_TIMES.realtime,

// Business requirement data (documents, packages)
staleTime: QUERY_STALE_TIMES.requirement,

// Navigation and lookups (client list, sidebar)
staleTime: QUERY_STALE_TIMES.navigation,

// Stable reference data (templates)
staleTime: QUERY_STALE_TIMES.stable,

// Static configuration (compliance standards)
staleTime: QUERY_STALE_TIMES.static,
```

---

## Error Handling

### Using ErrorBoundary

The global ErrorBoundary in `App.tsx` catches rendering errors and:
- Displays a fallback UI with recovery options
- Logs errors to the `audit_events` table in production

### Toast Notifications

```typescript
import { toast } from 'sonner';

// Success
toast.success('Document saved');

// Error with action
toast.error('Failed to save', {
  action: {
    label: 'Retry',
    onClick: () => handleRetry(),
  },
});

// Loading state
const toastId = toast.loading('Saving...');
// Later:
toast.success('Saved!', { id: toastId });
```

### Try-Catch Pattern

```typescript
try {
  await performAction();
  toast.success('Action completed');
} catch (error) {
  logger.error('Action failed', { error: error.message });
  toast.error('Something went wrong');
}
```

---

## Logging

### Using the Logger

```typescript
import { logger } from '@/lib/logger';

// Basic usage
logger.info('User logged in', { userId: '123' });
logger.error('Database connection failed', { code: 'ECONNREFUSED' });

// With context (recommended for components)
const log = logger.withContext('UserManagement');
log.debug('Fetching user list');
log.warn('Rate limit approaching', { remaining: 10 });
```

### Log Levels

| Level | Use For | Shows In |
|-------|---------|----------|
| `debug` | Development diagnostics | Dev only |
| `info` | General operational info | Dev only |
| `warn` | Potential issues | Dev + Prod |
| `error` | Errors (logged to audit) | Dev + Prod |

---

## Testing Standards

### Test File Locations

```
src/test/
├── fixtures/              # Shared test data
│   ├── auth-test-data.ts
│   └── package-test-data.ts
├── auth/                  # Auth-related tests
├── rbac/                  # Permission tests
└── packages/              # Package workflow tests
```

### Using Test Fixtures

```typescript
import { 
  mockSuperAdminProfile, 
  mockClientAdminProfile 
} from '../fixtures/auth-test-data';

describe('Permission checks', () => {
  it('allows Super Admin access', () => {
    expect(isSuperAdmin(mockSuperAdminProfile)).toBe(true);
  });
});
```

### Running Tests

```bash
# Run everything: frontend (Vitest) + Edge Functions (node --test), then
# print which Edge test files aren't covered by either harness
npm run test

# Frontend only
npm run test:frontend

# Run a specific frontend file
npm run test:frontend -- src/test/auth/useAuth.test.ts

# Frontend only, just tests related to files changed since the last commit
npm run test:frontend:changed

# Frontend watch mode
npm run test:watch

# Edge Functions only (supabase/functions/**)
npm run test:edge
```

---

## Edge Function Development

### Using Shared Utilities

```typescript
// supabase/functions/my-function/index.ts
import { createServiceClient } from "../_shared/supabase-client.ts";
import { jsonOk, jsonError, handleCors } from "../_shared/response-helpers.ts";
import { extractToken, verifyAuth, checkSuperAdmin } from "../_shared/auth-helpers.ts";

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") return handleCors();

  // Authenticate
  const token = extractToken(req);
  if (!token) return jsonError(401, "UNAUTHORIZED", "No token provided");

  const supabase = createServiceClient();
  const { user, profile, error } = await verifyAuth(supabase, token);
  if (error) return jsonError(401, "UNAUTHORIZED", error);

  // Authorize
  if (!checkSuperAdmin(profile)) {
    return jsonError(403, "FORBIDDEN", "Super Admin required");
  }

  // Business logic
  const result = await doSomething(supabase);
  return jsonOk(result);
});
```

### Application instrumentation

`audit_events` is for application telemetry only — error boundaries, edge-function failures, soft diagnostics. **Do not write compliance / business events here.** For domain audit writes, insert into the table that feeds `v_workspace_audit_log` (e.g. `client_audit_log`, `document_activity_log`, `audit_user_events`).

```typescript
// Application instrumentation only (telemetry / error capture)
await supabase.from('audit_events').insert({
  entity: 'document',
  action: 'render_failed',
  entity_id: documentId,
  user_id: user.id,
  details: { error: err.message },
});
```

---

## Database Conventions

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, **plural** | `document_instances`, `tenants`, `package_instances` |
| Columns | snake_case | `created_at`, `tenant_id` |
| Foreign Keys | `{table_singular}_id` | `tenant_id`, `package_instance_id` |
| Indexes | `idx_{table}_{columns}` | `idx_documents_tenant_id` |

> Singular table names exist only in archived `sql-setup/` bootstrap files and must not be reintroduced. The live schema is plural throughout.

### Canonical tables (orientation)

Quick crib for the most-confused names. There is **no** `clients`, `staff`, `client_assignments`, `doc_templates`, `generated_docs`, or `audit_log` table — those are archived bootstrap-doc names.

| Concept | Live table(s) |
|---------|---------------|
| Client organisations | `tenants` (PK `bigint`; legacy uuid in `id_uuid`) |
| Staff / internal users | `profiles` + `auth.users` (linked via `auth_user_id`) |
| Client portal members | `tenant_users` (canonical) + `tenant_members` |
| Client–consultant link | `tenant_csc_assignments` |
| Package catalog | `packages` |
| Package instances (per-tenant) | `package_instances` |
| Document templates | `documents` + `document_versions` + `document_template_mappings` |
| Generated documents | `document_instances` (operational, ~105k rows) |
| Audit ledger (read) | `v_workspace_audit_log` (federated, service_role only) |
| Consultation hours | `consult_logs` (other `consult_*` tables are empty / deprecated) |

### ID Strategy

- **Primary keys (new tenanted tables)**: `bigint generated always as identity`. This matches the canonical `tenants.tenant_id` and every modern operational table (`package_instances`, `document_instances`, `tenant_users`, etc.).
- **`tenant_id` is always `bigint`.** Never `uuid`. The legacy `tenants.id_uuid` column exists for backward linkage to old rows but is **not** the canonical key — do not introduce new FKs to it.
- **Use `uuid` only when**: (a) the column links to `auth.users` — name it `user_uuid uuid references auth.users(id)`; or (b) it stores an external integration ID that is natively a UUID (e.g. M365 Graph object IDs).
- **Foreign keys**: always explicit, with `ON DELETE` behaviour stated (`CASCADE` for child rows that cannot exist without the parent, `SET NULL` for soft links, `RESTRICT` for protected references).
- **Do not create PostgreSQL `enum` types.** Use `dd_{fieldname}` lookup tables with stable string `value` keys (see project memory: database-lookup-standards).

### RLS Policy Patterns

Always prefer the canonical security-definer helpers over hand-rolled subqueries. They are audited, indexed, and avoid the recursive-policy traps that have bitten this codebase before.

**Canonical helpers (use these):**

| Helper | Purpose |
|--------|---------|
| `public.is_super_admin()` / `public.is_super_admin(uuid)` | Vivacity Super Admin bypass |
| `public.is_vivacity_team_user(uuid)` | Any internal Vivacity team member |
| `public.is_staff()` | Staff-role check (edge-function authorization) |
| `public.has_tenant_access(_tenant_id bigint)` | Caller has membership in this tenant |
| `public.get_current_user_tenant()` | Caller's primary tenant_id |
| `public.has_any_eos_role(uuid, bigint)` | EOS module: any role in tenant |
| `public.is_eos_admin(uuid, bigint)` | EOS module: admin role |

**Rules:**

1. Always wrap `auth.uid()` as `(select auth.uid())` inside policy `USING` / `WITH CHECK` clauses. Bare `auth.uid()` re-evaluates per row (initplan bug); the wrapped form is evaluated once. 1,143 policies were just retrofitted for this — do not regress.
2. The membership column on `tenant_users` is `user_uuid`, **not** `user_id`. If you must hand-roll a subquery, use the right column.
3. **One permissive policy per (table, command).** Never stack 3–4 SELECT policies. OR the access paths inside a single policy body.

```sql
-- Tenant isolation (preferred — uses canonical helper)
CREATE POLICY "tenant_isolation" ON some_table
  FOR ALL TO authenticated
  USING ( public.has_tenant_access(tenant_id) );

-- Super Admin (canonical helper)
CREATE POLICY "super_admin_access" ON some_table
  FOR ALL TO authenticated
  USING ( public.is_super_admin() );

-- Combined: one policy per (table, cmd), OR'd internally
CREATE POLICY "select_policy" ON some_table
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_vivacity_team_user( (select auth.uid()) )
    OR public.has_tenant_access(tenant_id)
  );
```

### Function and View Hardening

1. **Functions.** Every new or replaced function MUST `SET search_path = ''` (empty string) and fully schema-qualify every reference (`public.tenants`, `auth.users`, never bare `tenants`). Follow with `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and explicit `GRANT EXECUTE` to `authenticated` and/or `service_role`. This neutralises search-path injection and matches the live security baseline.

2. **Views.** Every new or replaced view MUST be created with `WITH (security_invoker = true)`. `SECURITY DEFINER` views bypass RLS and are prohibited outside the federated audit ledger (`v_workspace_audit_log`), which is service_role-only by design.

3. **One permissive policy per (table, command).** If multiple access paths apply (super-admin OR Vivacity team OR tenant member), OR them inside a single policy body — do not create three parallel SELECT policies. The planner cannot collapse them and RLS performance degrades.

---

## Validation Patterns

### Using Validation Schemas

```typescript
import { 
  emailSchema, 
  abnSchema, 
  validateEmail,
  formatABN 
} from '@/lib/validation-schemas';

// Quick validation
if (!validateEmail(email)) {
  toast.error('Invalid email address');
  return;
}

// Zod parsing with error messages
const result = abnSchema.safeParse(abn);
if (!result.success) {
  setError(result.error.issues[0].message);
  return;
}

// Formatting
const formattedABN = formatABN('12345678901'); // "12 345 678 901"
```

### Available Schemas

| Schema | Validates |
|--------|-----------|
| `emailSchema` | Valid email format |
| `abnSchema` | 11-digit ABN with checksum |
| `phoneSchema` | Australian phone numbers |
| `uuidSchema` | UUID v4 format |
| `rtoCodeSchema` | RTO code format |
| `dateRangeSchema` | Valid date range |
| `paginationSchema` | Page/limit parameters |

---

## Quick Reference

### Imports Cheatsheet

```typescript
// Logging
import { logger } from '@/lib/logger';

// Query config
import { QUERY_PRESETS, QUERY_STALE_TIMES } from '@/lib/queryConfig';

// Validation
import { emailSchema, validateEmail } from '@/lib/validation-schemas';

// RBAC
import { useRBAC } from '@/hooks/useRBAC';

// Edge function utilities
import { createServiceClient } from "../_shared/supabase-client.ts";
import { jsonOk, jsonError, handleCors } from "../_shared/response-helpers.ts";
import { extractToken, verifyAuth } from "../_shared/auth-helpers.ts";
```

### Code Review Checklist

- [ ] Uses logger instead of console.log/error
- [ ] Uses QUERY_PRESETS for React Query config
- [ ] Uses validation schemas for user input
- [ ] Has appropriate RBAC checks
- [ ] Edge functions use shared utilities
- [ ] Audit events logged for material changes
- [ ] Error states handled with toast notifications
