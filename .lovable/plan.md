
# Unicorn 2.0 Developer Experience Improvements Plan

This plan addresses five key areas to improve maintainability, consistency, and developer experience across the codebase.

---

## Phase 1: Centralised Logging Utility

**Problem**: 269+ `console.log` and 2,083+ `console.error/warn` calls scattered across the codebase with inconsistent formatting and no production log control.

**Solution**: Create a structured logging utility that:
- Provides log levels (debug, info, warn, error)
- Auto-prefixes with component/module context
- Can be disabled in production
- Optionally sends critical errors to the audit table

### Files to Create/Modify

**New file: `src/lib/logger.ts`**
```text
Structured logger with:
- Log levels: debug, info, warn, error
- Context prefix support: logger.withContext('ComponentName')
- Production mode filtering (no debug logs in prod)
- Optional audit integration for errors
- Consistent timestamp formatting
```

**Migration approach**:
- Start with new code using the logger
- Document patterns in CONTRIBUTING.md
- Gradual migration of existing console calls as files are touched

---

## Phase 2: Edge Function Shared Utilities

**Problem**: 48 edge functions with duplicated patterns:
- Supabase client creation (39 files)
- JSON response helpers (redefined in 15+ files)
- Auth token extraction (duplicated in 20+ files)
- Permission checks (inconsistent patterns)

**Solution**: Expand `_shared/` with three new utilities.

### Files to Create

**New file: `supabase/functions/_shared/supabase-client.ts`**
```text
Provides:
- createServiceClient(): Bypass RLS with service role
- createUserClient(authHeader): User-scoped client
- Consistent error handling for missing env vars
```

**New file: `supabase/functions/_shared/response-helpers.ts`**
```text
Provides:
- jsonOk(data): Standard 200 success response
- jsonError(status, code, detail): Standard error response
- handleCors(req): CORS preflight handler
```

**New file: `supabase/functions/_shared/auth-helpers.ts`**
```text
Provides:
- extractToken(req): Get Bearer token from header
- verifyAuth(supabase, token): Validate and return user
- checkSuperAdmin(profile): Consistent SuperAdmin check
- checkTenantAdmin(profile, tenantId): Tenant admin check
```

### Migration Example

Before (toggle-user-status):
```typescript
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
);

function jsonErr(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders },
    status,
  });
}
```

After:
```typescript
import { createServiceClient } from "../_shared/supabase-client.ts";
import { jsonError, jsonOk, handleCors } from "../_shared/response-helpers.ts";
import { extractToken, verifyAuth, checkSuperAdmin } from "../_shared/auth-helpers.ts";

if (req.method === "OPTIONS") return handleCors();

const supabase = createServiceClient();
const token = extractToken(req);
const { user, error } = await verifyAuth(supabase, token);
```

---

## Phase 3: Developer Documentation (CONTRIBUTING.md)

**Problem**: No central documentation for development standards, patterns, and conventions.

**Solution**: Create a comprehensive CONTRIBUTING.md that serves as the single source of truth.

### File to Create

**New file: `CONTRIBUTING.md`**

Sections to include:

1. **Project Architecture**
   - Directory structure overview
   - Key components and their responsibilities

2. **RBAC Patterns**
   - Role hierarchy (SuperAdmin, Admin, General User)
   - Using `useRBAC` hook
   - Permission-gated components
   - Edge function permission checks

3. **React Query Configuration**
   - Using `QUERY_STALE_TIMES` and `QUERY_PRESETS`
   - Choosing the right staleTime tier
   - Examples for each category

4. **Error Handling**
   - Using ErrorBoundary
   - Toast notification patterns
   - Audit logging

5. **Testing Standards**
   - Test file locations
   - Using test fixtures
   - Running tests locally

6. **Edge Function Development**
   - Using shared utilities
   - CORS handling
   - Audit event logging

7. **Database Conventions**
   - Naming conventions (snake_case)
   - RLS policy patterns
   - UUID vs incremental IDs

---

## Phase 4: Shared Validation Schemas

**Problem**: Common validation patterns (emails, ABNs, phone numbers, UUIDs) are implemented inconsistently across the codebase.

**Solution**: Create a centralised Zod schema library.

### File to Create

**New file: `src/lib/validation-schemas.ts`**
```text
Common schemas:
- emailSchema: Valid email format
- abnSchema: 11-digit ABN with checksum validation
- phoneSchema: Australian phone formats
- uuidSchema: UUID v4 format
- rtoCodeSchema: Valid RTO code format
- dateRangeSchema: Start/end date with validation
- paginationSchema: Page/limit with sensible defaults

Usage helpers:
- validateEmail(email): Returns boolean
- formatABN(abn): Returns formatted string
- parsePhoneNumber(input): Normalises phone input
```

### Usage Example

Before:
```typescript
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return { error: "Invalid email" };
}
```

After:
```typescript
import { emailSchema, validateEmail } from '@/lib/validation-schemas';

// Option 1: Quick validation
if (!validateEmail(email)) {
  return { error: "Invalid email" };
}

// Option 2: Zod parsing with detailed errors
const result = emailSchema.safeParse(email);
if (!result.success) {
  return { error: result.error.message };
}
```

---

## Phase 5: UX Consistency Enhancements

**Problem**: 
- Loading states use inconsistent skeleton patterns
- No offline detection or network status feedback

**Solution**: Extend loading skeleton library and add network status indicator.

### Files to Create/Modify

**Expand: `src/components/ui/loading-skeleton.tsx`**
```text
Add additional skeleton variants:
- FormSkeleton: For form loading states
- DetailPageSkeleton: For detail views
- ListItemSkeleton: For list items
- BreadcrumbSkeleton: For navigation loading
- TabsSkeleton: For tabbed interfaces
```

**New file: `src/components/NetworkStatusIndicator.tsx`**
```text
Features:
- Detects offline/online state via navigator.onLine
- Shows toast when connection lost
- Shows recovery toast when connection restored
- Optional banner mode for persistent display
```

**New file: `src/hooks/useNetworkStatus.ts`**
```text
Hook providing:
- isOnline: boolean
- lastOnline: Date | null
- connectionQuality: 'good' | 'slow' | 'offline'
```

### Integration Point

Add to `AuthenticatedLayout.tsx`:
```typescript
<NetworkStatusIndicator />
```

---

## Implementation Summary

| Phase | Priority | Files | Effort |
|-------|----------|-------|--------|
| 1. Centralised Logging | Medium | 1 new | Small |
| 2. Edge Function Utilities | High | 3 new | Medium |
| 3. CONTRIBUTING.md | High | 1 new | Medium |
| 4. Validation Schemas | Medium | 1 new | Small |
| 5. UX Enhancements | Low | 3 new/modified | Small |

---

## Technical Notes

### Edge Function Shared Utilities Design

The new shared utilities follow the existing pattern in `addin-auth.ts`:
- Export pure functions (no side effects on import)
- Use Deno env access at runtime
- Include TypeScript types for all parameters/returns
- Document usage with JSDoc comments

### Logger Integration with Audit

For critical errors, the logger can optionally log to `audit_events`:
```typescript
// Only in production, only for errors
if (level === 'error' && !isDev) {
  try {
    await supabase.from('audit_events').insert({
      entity: 'client_error',
      action: context,
      details: { message, timestamp, url: window.location.href }
    });
  } catch {}
}
```

### Network Status Implementation

Uses browser APIs:
```typescript
const [isOnline, setIsOnline] = useState(navigator.onLine);

useEffect(() => {
  const handleOnline = () => setIsOnline(true);
  const handleOffline = () => setIsOnline(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);
```
