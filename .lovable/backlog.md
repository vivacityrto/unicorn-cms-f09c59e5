# Unicorn 2.0 Backlog

Technical debt and TODO items tracked for future implementation.

---

## Open Items

### 1. Browse Library Flow (Audits)
**File:** `src/pages/Audits.tsx:228`  
**Priority:** Low  
**Description:** Implement the browse library dialog for audit templates.  
```typescript
// TODO: Implement browse library flow
```

---

### 2. Send Note to Client (ClientStructuredNotesTab)
**File:** `src/components/client/ClientStructuredNotesTab.tsx:548`  
**Priority:** Medium  
**Description:** Implement email sending functionality to send structured notes to clients.  
```typescript
// TODO: Implement email sending functionality
```

---

### 3. Email Notification on Document Release (ReleaseDocumentsDialog)
**File:** `src/components/document/ReleaseDocumentsDialog.tsx:137`  
**Priority:** Medium  
**Description:** When `sendEmail` is true during document release, trigger email notification to relevant parties.  
```typescript
// TODO: If sendEmail is true, trigger email notification
```

---

### 4. Accountability Chart Version Preview (ChartBuilder)
**File:** `src/components/eos/accountability/ChartBuilder.tsx:488`  
**Priority:** Low  
**Description:** Implement version preview functionality for accountability chart history.  
```typescript
// TODO: Implement version preview
```

---

### 5. Accountability Chart Version Restore (ChartBuilder)
**File:** `src/components/eos/accountability/ChartBuilder.tsx:492`  
**Priority:** Low  
**Description:** Implement restore functionality to revert accountability chart to a previous version.  
```typescript
// TODO: Implement restore
```

---

### 6. Override Modal — Email Format Validation
**Priority:** Medium
**Description:** Add email format validation to the override modal in the bulk invite flow (carried over from launch session).

---

### 7. RBAC — Load Structured Fields into Auth Profile
**Files:** `src/hooks/useAuth.tsx`, `src/components/layout/AuthenticatedLayout.tsx`, `src/components/DashboardLayout.tsx`, `src/contexts/TenantTypeContext.tsx`
**Priority:** Medium
**Description:** Extend the `UserProfile` interface and `fetchUserProfile` select in `useAuth.tsx` to include `is_team` and `user_type`. Migrate the three sidebar-decision sites to a structured-fields gate:
```ts
const isVivacityTeam =
  profile?.is_team === true ||
  ['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '');
```
The `OR` is required during transition because Angela's main account has `unicorn_role = 'Super Admin'` but `is_team = false` — an `is_team`-only gate would lock her (and any similarly-misconfigured staff) out of the SuperAdmin sidebar. Once item 9 is resolved and the backfill is verified across all staff, tighten to `is_team === true` alone. Requires a regression pass on every `unicorn_role`-gated screen.

---

### 8. Backfill `is_team = true` for Angela's Main Account
**Priority:** High (do before item 7 ships)
**Description:** Migration to fix the canary account:
```sql
UPDATE public.users SET is_team = true
WHERE email = 'angela@vivacity.com.au';
```
Broaden to all staff with `user_type = 'Vivacity Team' AND is_team = false` once item 9's root cause is understood.

---

### 9. Investigate `is_team` Trigger Gap on Legacy Accounts
**Priority:** Medium
**Description:** Angela's account has `user_type = 'Vivacity Team'` but `is_team = false`. Determine whether:
  (a) no trigger exists to derive `is_team` from `user_type`,
  (b) a trigger exists but only fires on INSERT (not retroactive for older accounts), or
  (c) the trigger was added after Angela's account was provisioned.
Audit all `users` rows where `user_type = 'Vivacity Team' AND is_team = false` and either backfill or add a one-time reconciliation migration. Required before item 7's gate can be tightened to `is_team` alone.

---

## Summary

| # | Item | File | Priority |
|---|------|------|----------|
| 1 | Browse Library Flow | Audits.tsx | Low |
| 2 | Send Note to Client | ClientStructuredNotesTab.tsx | Medium |
| 3 | Email on Document Release | ReleaseDocumentsDialog.tsx | Medium |
| 4 | Chart Version Preview | ChartBuilder.tsx | Low |
| 5 | Chart Version Restore | ChartBuilder.tsx | Low |
| 6 | Override Modal Email Validation | (bulk invite override modal) | Medium |
| 7 | RBAC Structured-Fields Refactor | useAuth + 3 sidebar sites | Medium |
| 8 | Backfill `is_team` for Angela | DB migration | High |
| 9 | Investigate `is_team` Trigger Gap | DB audit | Medium |

---

*Last updated: 2026-05-02*
