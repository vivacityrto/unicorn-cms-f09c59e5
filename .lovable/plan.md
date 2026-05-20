## Plan: Replace `/academy/settings` with `/academy/profile` reusing `ClientProfilePage`

### Problem
The `/academy/settings` page (`AcademySettings.tsx`) is broken — it has placeholder tabs, non-functional forms, and tier-centric billing content that doesn't match the current relationship-role model. Academy users need a working profile editor (first name, last name, phone, position) just like compliance users get on `/client/profile`.

### Solution
Reuse the existing `ClientProfilePage` inside an `AcademyLayout` wrapper, creating `/academy/profile`. Remove the dead `/academy/settings` route and its page component.

### Changes

#### 1. New wrapper file: `src/pages/client/AcademyProfileWrapper.tsx`
Mirror `ClientProfileWrapper.tsx` exactly, but swap `ClientLayout` for `AcademyLayout`:

```tsx
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const ClientProfilePage = lazy(() => import("@/pages/client/ClientProfilePage"));

export default function AcademyProfileWrapper() {
  return (
    <AcademyLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <ClientProfilePage />
      </Suspense>
    </AcademyLayout>
  );
}
```

`ClientProfilePage` uses `useClientTenant` and `useClientActingUser`; both `ClientLayout` and `AcademyLayout` wrap children in `ClientTenantProvider` + `HelpCenterProvider`, so the profile page will continue to work unchanged.

#### 2. `src/App.tsx` — route swap
- Add lazy import: `const AcademyProfileWrapperNew = lazy(() => import("./pages/client/AcademyProfileWrapper"));`
- Add route inside the academy routes block:
  ```tsx
  <Route path="/academy/profile" element={<ProtectedRoute><AcademyProfileWrapperNew /></ProtectedRoute>} />
  ```
- Remove lazy import: `const AcademySettings = lazy(() => import("./pages/academy/AcademySettings"));`
- Remove route: `<Route path="/academy/settings" ... />`

#### 3. `src/components/layout/AcademyLayout.tsx` — sidebar link
Update `academyAccountItems` array:

```tsx
const academyAccountItems = [
  { icon: User, label: "Profile", path: "/academy/profile" },
];
```

#### 4. `src/components/layout/AcademyTopBar.tsx` — dropdown link + route title
- Update `academyRouteTitles` map: remove `"/academy/settings": "Settings"`, add `"/academy/profile": "Profile"`.
- Change the avatar dropdown "Profile Settings" link to point to `/academy/profile` with visible label "Profile" (instead of `/settings?tab=profile` / "Profile Settings").

#### 5. Delete `src/pages/academy/AcademySettings.tsx`
No remaining callers after step 2.

### What does NOT change
- `ClientProfilePage`, `ClientProfileWrapper`, `/client/profile` route — untouched.
- `Settings.tsx` (the `/settings` compliance page) — untouched.
- `useClientActingUser`, `useClientTenant`, `useAuth` — untouched.
- Schema, RLS, RPC, edge functions.
- Any other academy route or menu item.

### Verification
- `rg "AcademySettings" src/` → zero matches (file deleted, route gone, no imports).
- `rg "/academy/settings" src/` → zero matches.
- Academy sidebar "Account" section shows "Profile" → navigates to `/academy/profile`.
- Academy avatar dropdown "Profile" → navigates to `/academy/profile`.
- Direct `/academy/settings` → 404 (route removed).
- `/client/profile` still works for compliance users.
- TypeScript builds clean.
