
# Tenant-Type Based Navigation and Access Control

## Summary

Implement a multi-tenant navigation system that differentiates between **Compliance System Members** (full platform access) and **Vivacity Academy Members** (training-focused, limited scope). This includes renaming "Vivacity Training" to "Vivacity Academy" globally and creating separate navigation shells for each tenant type.

---

## Current State Analysis

### Database Structure
- The `tenants` table has no `tenant_type` column - this needs to be added
- User types exist: `Vivacity Team`, `Client Parent`, `Client Child`
- No Academy-specific user or tenant classification exists

### Existing Navigation
- `DashboardLayout.tsx` handles both Vivacity Team and Client navigation
- Navigation is role-based (Super Admin, Team Leader, Team Member, Admin, User)
- No tenant-type filtering currently implemented

### Existing Components
- `TopBar.tsx` - Header with logo, title, breadcrumbs, actions
- `UtilityFooter.tsx` - Compact footer with tenant name, role, session info, quick links
- `Footer.tsx` - Static marketing footer (for public pages)

---

## Implementation Plan

### Phase 1: Database Schema Changes

**1.1 Create tenant_type enum and add column**

```sql
-- Create enum for tenant types
CREATE TYPE public.tenant_type AS ENUM (
  'compliance_system',      -- Full platform access
  'academy_solo',           -- Single user, training only
  'academy_team',           -- Up to 10 users
  'academy_elite'           -- Up to 30 users
);

-- Add tenant_type column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN tenant_type public.tenant_type 
DEFAULT 'compliance_system' NOT NULL;

-- Add index for tenant_type queries
CREATE INDEX idx_tenants_tenant_type ON public.tenants(tenant_type);
```

**1.2 Add Academy-specific fields to tenants**

```sql
-- Academy subscription limits
ALTER TABLE public.tenants
ADD COLUMN academy_max_users integer DEFAULT NULL,
ADD COLUMN academy_subscription_expires_at timestamptz DEFAULT NULL;
```

---

### Phase 2: Context and Hooks

**2.1 Create TenantTypeContext**

New file: `src/contexts/TenantTypeContext.tsx`

- Provides tenant type information to the entire app
- Fetches tenant type based on user's primary tenant
- Exposes helper functions:
  - `isComplianceMember(): boolean`
  - `isAcademyMember(): boolean`
  - `academyTier: 'solo' | 'team' | 'elite' | null`

**2.2 Update useAuth hook**

Extend `UserProfile` interface to include:
- User's tenant type (fetched via tenant relationship)
- Academy tier if applicable

---

### Phase 3: Navigation Architecture

**3.1 Create Separate Menu Configurations**

New file: `src/config/navigationConfig.ts`

```text
COMPLIANCE MEMBER MENU
----------------------
SIDEBAR:
- Dashboard
- Clients
- Documents  
- Resource Hub
- Vivacity Consultant
- Vivacity Academy (link to academy)
- Tasks
- Events

ACADEMY MEMBER MENU
-------------------
SIDEBAR:
- Academy Dashboard
- My Courses
- Certificates
- Events
- Community
- Profile
- Team Members (Academy Team/Elite only)
```

**3.2 Create Academy Layout Component**

New file: `src/components/layout/AcademyLayout.tsx`

- Separate layout shell for Academy members
- Learning-platform aesthetic (not CMS-like)
- Simplified navigation structure
- Different colour scheme (optional)

**3.3 Create Academy Footer Component**

New file: `src/components/layout/AcademyFooter.tsx`

Footer content:
- Vivacity Academy branding
- Help Centre link
- FAQs link
- Terms and Conditions link
- Privacy Policy link
- Support link

---

### Phase 4: Layout Switching Logic

**4.1 Update DashboardLayout**

Modify `src/components/DashboardLayout.tsx`:

```text
Logic flow:
1. Determine if user is Vivacity Team -> Use existing Vivacity Team menu
2. Determine tenant type from context
3. If compliance_system -> Use Compliance Member menu
4. If academy_* -> Render AcademyLayout instead
```

**4.2 Create Layout Router Component**

New file: `src/components/layout/AuthenticatedLayout.tsx`

- Wraps route content
- Selects appropriate layout based on tenant type
- Handles edge cases (no tenant, loading state)

---

### Phase 5: Route Protection

**5.1 Create TenantTypeGuard Component**

New file: `src/components/guards/TenantTypeGuard.tsx`

- Protects routes based on tenant type
- Redirects Academy members away from compliance routes
- Shows "access denied" or redirects appropriately

**5.2 Update ProtectedRoute Component**

Add optional `requiredTenantType` prop:

```tsx
<ProtectedRoute requiredTenantType="compliance_system">
  <ComplianceOnlyPage />
</ProtectedRoute>
```

---

### Phase 6: Footer Updates

**6.1 Update Compliance Member Footer**

Modify `src/components/layout/UtilityFooter.tsx`:

Left section:
- Active RTO name (from tenant)
- Current package name
- Assigned Vivacity Consultant

Right section:
- Help Centre
- Vivacity Academy link
- Updates Log

**6.2 Create Academy Footer**

New file: `src/components/layout/AcademyFooter.tsx`:

- Vivacity Academy branding/logo
- Help Centre
- FAQs  
- Terms and Conditions
- Privacy Policy
- Support

---

### Phase 7: Global Rename

**7.1 Search and Replace**

No instances of "Vivacity Training" found in the codebase. The term does not appear to be in use. However, ensure any future references use "Vivacity Academy".

**7.2 Add Academy Route Titles**

Update `src/components/layout/TopBar.tsx` to include Academy routes:

```typescript
const routeTitles: Record<string, string> = {
  // ... existing routes
  "/academy": "Academy Dashboard",
  "/academy/courses": "My Courses",
  "/academy/certificates": "Certificates",
  "/academy/events": "Events",
  "/academy/community": "Community",
  "/academy/team": "Team Members",
};
```

---

## Technical Details

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/XXXXXX_add_tenant_type.sql` | Database schema changes |
| `src/contexts/TenantTypeContext.tsx` | Tenant type context provider |
| `src/config/navigationConfig.ts` | Centralised menu configurations |
| `src/components/layout/AcademyLayout.tsx` | Academy-specific layout shell |
| `src/components/layout/AcademyFooter.tsx` | Academy footer component |
| `src/components/layout/AuthenticatedLayout.tsx` | Layout router/switcher |
| `src/components/guards/TenantTypeGuard.tsx` | Route protection by tenant type |

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useAuth.tsx` | Add tenant type to profile fetch |
| `src/components/DashboardLayout.tsx` | Add tenant-type-based menu switching |
| `src/components/layout/TopBar.tsx` | Add Academy route titles |
| `src/components/layout/UtilityFooter.tsx` | Update for Compliance members |
| `src/App.tsx` | Wrap with TenantTypeProvider, add Academy routes |
| `src/integrations/supabase/types.ts` | Add tenant_type to TypeScript types |

### Type Definitions

```typescript
// Tenant types
type TenantType = 
  | 'compliance_system' 
  | 'academy_solo' 
  | 'academy_team' 
  | 'academy_elite';

// Academy tier helpers
type AcademyTier = 'solo' | 'team' | 'elite';

// Context interface
interface TenantTypeContextValue {
  tenantType: TenantType | null;
  isComplianceMember: boolean;
  isAcademyMember: boolean;
  academyTier: AcademyTier | null;
  loading: boolean;
}
```

---

## Security Considerations

1. **Route Protection**: Academy members cannot access compliance routes via URL manipulation
2. **API Filtering**: RLS policies should filter data based on tenant type
3. **No Feature Leakage**: UI completely hides unavailable features
4. **Tenant Isolation**: Academy tenants cannot see compliance data and vice versa

---

## Out of Scope

- Academy course content management
- Academy LMS functionality
- Payment/subscription integration
- Academy user onboarding flows
- Community feature implementation

These are UI and navigation changes only, as specified in the constraints.

---

## Implementation Order

1. Database migration (tenant_type column)
2. TenantTypeContext creation
3. Update useAuth to fetch tenant type
4. Create navigation configuration
5. Create AcademyLayout and AcademyFooter
6. Update DashboardLayout with tenant-type switching
7. Update UtilityFooter for Compliance members
8. Add TenantTypeGuard for route protection
9. Add Academy routes to App.tsx
10. Testing and validation
