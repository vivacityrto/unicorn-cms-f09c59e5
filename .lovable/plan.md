## Bulk Membership Certificate Download

Add a CSC/SuperAdmin-only page to bulk-generate Vivacity SuperHero Membership Certificates, with individual downloads for ≤2 selections and a zip bundle for more.

### Changes (4 files, scope-locked)

**1. `package.json`** — add `jszip` to dependencies (via `bun add jszip`).

**2. `src/components/DashboardLayout.tsx`**
- Import `Download` from `lucide-react` (if not already).
- Add to `clientsMenuItems` after the Audits entry:
  ```ts
  { icon: Download, label: "Bulk Cert Download", path: "/admin/bulk-membership-certificates", cscOrSuperAdminOnly: true }
  ```
- In the `clients` `renderSection` call (~line 476), append a `.filter(...)` that hides items flagged `cscOrSuperAdminOnly` unless `isSuperAdmin || userRole === 'CSC'`.

**3. `src/pages/admin/BulkMembershipCertificatesPage.tsx`** — new file, exactly as specified:
- Guard via `useAuth` + `useRBAC`; redirect non-CSC/non-SuperAdmin to `/`.
- Fetch active `package_instances` where `billing_category = 'membership_rto'`, join tenants and packages client-side (flat queries).
- Checkbox list with Select All / Clear / selected count.
- On Download: call `generate-membership-certificate` edge function per tenant with caller's access token + anon apikey, parse `Content-Disposition` for filename.
- ≤2 results → individual downloads; >2 → `JSZip` bundle named `Vivacity-Membership-Certificates.zip`.
- Progress bar + toast summaries for success/failures.

**4. `src/App.tsx`**
- Import `BulkMembershipCertificatesPage` with the other admin page imports.
- Register `<Route path="/admin/bulk-membership-certificates" element={<BulkMembershipCertificatesPage />} />` alongside other `/admin/*` routes (inheriting whatever protection wrapper they use).

### Notes
- The edge function already exposes `Content-Disposition` (prior change), so filename parsing will work.
- The user-supplied JSX in the spec is partially truncated/garbled by the chat; I will reconstruct the JSX faithfully to match the described behaviour (header, list rows with checkbox/name/rto_name/package badge, progress bar, download button) using existing UI primitives (`Button`, `Checkbox`, `Badge`, `Progress`).
- No other files touched; no DB or edge function changes.
