## Fix: Expose SuperAdmin Academy admin pages in sidebar

**File:** `src/components/DashboardLayout.tsx` (only)

### Change 1 — Add `Award` to lucide-react imports (line 2)

`Shield`, `ShieldCheck`, and `Users` are already imported. `Award` is not — add it for the Certificates link.

### Change 2 — Extend `academyBuilderMenuItems` (lines 99–102)

Replace the current 2-item array with 5 items, in this order:

```ts
const academyBuilderMenuItems = [
  { icon: ShieldCheck, label: "Tenant Access", path: "/superadmin/academy/tenant-access" },
  { icon: Users, label: "Enrolments", path: "/superadmin/academy/enrollments" },
  { icon: Award, label: "Certificates", path: "/superadmin/academy/certificates" },
  { icon: GraduationCap, label: "Academy Builder", path: "/superadmin/academy/builder" },
  { icon: GraduationCap, label: "Package → Course Rules", path: "/superadmin/academy/package-course-rules" },
];
```

### Out of scope (untouched)

- Route definitions in `src/App.tsx`
- Route protection / SuperAdmin gating (the section is already SuperAdmin-only via existing render logic at line 506)
- `AcademyAccessGate`, `ClientTenantContext`, RLS, DB logic, tenant access toggle behaviour

### Verification

- As SuperAdmin, sidebar Academy section lists: Tenant Access, Enrolments, Certificates, Academy Builder, Package → Course Rules
- Tenant Access link navigates to `/superadmin/academy/tenant-access`
- Existing Academy Builder and Package → Course Rules links still work
