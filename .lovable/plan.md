## Plan: Membership Certificate Download (Phase 1 – Ruby)

### 1. Edge function: `supabase/functions/generate-membership-certificate/index.ts`
Mirrors `generate-certificate-pdf` style (serve, createClient with service role, `corsHeaders`, `jsonResponse`, `pdf-lib@1.17.1`). All error responses use `jsonResponse` so `Content-Type: application/json` is always set.

Flow:
1. Handle OPTIONS preflight.
2. Validate `Authorization` bearer → `supabase.auth.getUser(callerToken)`. 401 on missing/invalid.
3. Parse body `{ tenant_id: number }`; 400 if not finite.
4. Authorise: lookup caller in `users` by `user_uuid = callerUser.user.id`, select `tenant_id, is_vivacity_internal`. Allow if `is_vivacity_internal === true` or `tenant_id === body.tenant_id`. Otherwise 403.
5. Data lookup — query `package_instances` joined to `packages` (filtered to `package_type = 'membership'`) and `tenants`:
   ```ts
   supabase.from('package_instances')
     .select('start_date, packages!inner(name, package_type), tenants!inner(name)')
     .eq('tenant_id', tenant_id)
     .eq('is_active', true)
     .eq('packages.package_type', 'membership')
     .limit(1).maybeSingle()
   ```
   - No row → 404 `{ ok:false, code:'NO_MEMBERSHIP' }`.
6. Tier mapping on `packages.name`:
   - `M-RR`/`M-RC` → ruby
   - `M-DR`/`M-DC` → diamond
   - `M-SAR`/`M-SAC` → sapphire
   - `M-GR`/`M-GC` → gold
   - `M-AM` → amethyst
   - else → 404 `NO_CERTIFICATE_FOR_TIER`
   - Non-ruby → 404 `COMING_SOON` (Phase 1).
7. Download `doc-templates/membership/certificate-template-ruby.pdf`. 500 on failure.
8. PDF: `PDFDocument.load(tplBytes)`, `getPages()[0]`, embed `HelveticaBold`, define `drawCentered(text, font, size, color, y)` using `CENTER_X = 297.64`.
   - Tenant name: 28pt, fuchsia `rgb(0.929, 0.094, 0.471)`, y = 575.
   - Commencement date (`DD/MM/YYYY` from `start_date`): 24pt, same fuchsia, y = 435.
   - These y values are estimates; expect a follow-up fine-tune prompt after the first Ruby test render.
9. Return `pdfDoc.save()` bytes with:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="vivacity-membership-certificate.pdf"`
   - `...corsHeaders`
   No storage upload, no signed URL.

### 2. Frontend page: `src/pages/client/MembershipCertificatePage.tsx`
- Heading "Your Membership Certificate" + subtext "Download your official Vivacity Superhero Membership Certificate."
- Single brand-style button (purple→fuchsia gradient using existing brand tokens) labelled "Download Certificate".
- On click:
  - Resolve `tenant_id` from `useClientTenant().activeTenantId`.
  - `fetch` `${VITE_SUPABASE_URL}/functions/v1/generate-membership-certificate` (POST, JSON body) with `Authorization: Bearer ${session.access_token}` and `apikey` header. (`supabase.functions.invoke` isn't used because it JSON-parses responses.)
  - Branch on `response.headers.get('content-type')`:
    - `application/pdf` → `response.blob()` → object URL → temporary `<a download="vivacity-membership-certificate.pdf">` click → revoke URL.
    - `application/json` → parse, inspect `code`.
- In-flight: button shows spinner + "Generating your certificate…".
- Error `NO_MEMBERSHIP`, `COMING_SOON`, `NO_CERTIFICATE_FOR_TIER` → inline message: "Your membership certificate is not yet available. Please contact your Client Success Consultant."
- Any other error → `use-toast` toast.

### 3. Routing & nav
- Register route `/client/certificate` alongside the other `/client/*` routes, wrapped by `ClientRouteGuard`.
- `src/components/client/ClientSidebar.tsx`: **append only** — add a single entry `{ icon: Award, label: "My Certificate", path: "/client/certificate" }` at the end of the existing nav list. No reordering or modification of existing items.

### 4. Out of scope (untouched)
- `generate-certificate-pdf`, `AcademyCertificatesPage.tsx`
- Tenant/package React Query hooks, dashboard cards, admin views, RLS policies.

### Post-deploy note
Template must exist at `doc-templates/membership/certificate-template-ruby.pdf`. After first deploy, test with a Ruby-tier tenant; expect a follow-up to fine-tune the y-coordinates for the name and date so they sit in the template's blank spaces.
