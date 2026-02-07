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
# Run all tests
npm run test

# Run specific file
npm run test src/test/auth/useAuth.test.ts

# Watch mode
npm run test:watch
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

### Audit Event Logging

```typescript
await supabase.from('audit_events').insert({
  entity: 'document',
  action: 'created',
  entity_id: documentId,
  user_id: user.id,
  details: { title: document.title },
});
```

---

## Database Conventions

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, singular | `document_instance` |
| Columns | snake_case | `created_at`, `tenant_id` |
| Foreign Keys | `{table}_id` | `user_id`, `tenant_id` |
| Indexes | `idx_{table}_{columns}` | `idx_documents_tenant_id` |

### ID Strategy

- **Primary keys**: UUID via `gen_random_uuid()`
- **Never use**: Incremental IDs
- **Foreign keys**: Always explicit references

### RLS Policy Patterns

```sql
-- User can only see their own data
CREATE POLICY "Users view own data" ON documents
  FOR SELECT USING (auth.uid() = user_id);

-- Tenant isolation
CREATE POLICY "Tenant isolation" ON documents
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Super Admin bypass
CREATE POLICY "Super Admin access" ON documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE user_uuid = auth.uid() 
      AND unicorn_role = 'Super Admin'
    )
  );
```

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
