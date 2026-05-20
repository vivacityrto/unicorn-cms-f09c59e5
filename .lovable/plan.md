## Goal
When `academy_access_enabled = false`, academy users see only the "Access not yet active" empty state plus a Sign out link — no sidebar, no topbar, no footer.

## Changes

### 1. `src/components/layout/AcademyLayout.tsx` — host the gate
- Add imports: `useClientTenant` from `@/contexts/ClientTenantContext`, `useAuth` from `@/hooks/useAuth`, `Loader2` already imported via existing icon set (add if missing).
- Because `useClientTenant` must run inside `ClientTenantProvider`, split the component:
  - `AcademyLayout` returns `<ClientTenantProvider><HelpCenterProvider><AcademyLayoutInner>{children}</AcademyLayoutInner></HelpCenterProvider></ClientTenantProvider>`.
  - `AcademyLayoutInner` holds all existing state/hooks and the current sidebar/topbar/main/footer markup.
- Inside `AcademyLayoutInner`, read `{ academyAccessEnabled, academyAccessLoading } = useClientTenant()` and `{ signOut } = useAuth()`.
  - `academyAccessLoading` → return full-screen centered `Loader2` (no chrome).
  - `!academyAccessLoading && !academyAccessEnabled` → return full-page empty state:
    - Gradient `GraduationCap` badge with `linear-gradient(135deg, #7130A0, #ed1878)`.
    - H1 "Vivacity Academy".
    - Paragraph "Your organisation's Academy access is not yet active. Contact your Vivacity consultant to get started."
    - `<button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline mt-4">Sign out</button>`.
  - Otherwise → existing sidebar + `AcademyTopBar` + `<main>{children}</main>` + `AcademyFooter` + `HelpCenterDrawer` + impersonation banner (unchanged).

### 2. Unwrap `<AcademyAccessGate>` from every wrapper
For each file, remove `import AcademyAccessGate from "@/components/academy/AcademyAccessGate";` and replace the `<AcademyAccessGate>…</AcademyAccessGate>` block with just its `<Suspense>` child:
- `src/pages/client/AcademyAdminAssistantWrapper.tsx`
- `src/pages/client/AcademyAssessmentResultWrapper.tsx`
- `src/pages/client/AcademyAssessmentWrapper.tsx`
- `src/pages/client/AcademyComplianceManagerWrapper.tsx`
- `src/pages/client/AcademyCourseDetailWrapper.tsx`
- `src/pages/client/AcademyDashboardWrapper.tsx`
- `src/pages/client/AcademyGovernancePersonWrapper.tsx`
- `src/pages/client/AcademyLessonViewerWrapper.tsx`
- `src/pages/client/AcademyStudentSupportWrapper.tsx`
- `src/pages/client/AcademyTrainerWrapper.tsx`

### 3. Delete `src/components/academy/AcademyAccessGate.tsx`
No remaining importers after step 2.

## Out of scope
`ClientTenantContext`, `useClientTenant`, `tenants.academy_access_enabled`, `AcademyTopBar`, `AcademyFooter`, routes, RLS, RPCs.

## Verification
- `rg "AcademyAccessGate" src/` → zero matches.
- Tenant 7546 (`academy_access_enabled=false`): `/academy`, `/academy/courses`, `/academy/pdp`, `/academy/certificates`, `/academy/community` all show only empty-state card + Sign out link; no sidebar/topbar/footer.
- Sign out signs the user out and returns to login.
- Flip enabled → full layout returns, Sign out link gone.
- Loading branch shows spinner, no flash of chrome.
- TypeScript builds clean.

## Risks
- Any academy page not wrapped in `AcademyLayout` would bypass the gate; current grep confirms none exist outside the listed wrappers.
- `signOut` is exported by `useAuth` (`src/hooks/useAuth.tsx:175`); use it directly rather than `supabase.auth.signOut()`.
