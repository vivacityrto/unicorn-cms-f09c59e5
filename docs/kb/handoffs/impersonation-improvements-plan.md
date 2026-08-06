# Impersonation Feature Improvements — Implementation Plan

> **Created:** 18 June 2026 · **Status:** ✅ All phases complete (18 Jun 2026)
>
> Covers improvements to the "View as Client" impersonation feature for the CSC workflow. Fixes the missing user picker in Portal preview mode and adds CSC-focused enhancements.

---

## Background

The impersonation feature lets Vivacity staff (SuperAdmin and Vivacity Team roles) enter a client's perspective for support, onboarding, and audit preparation. Two modes exist:

- **Portal preview** — read-only view of the compliance portal. No user picker shown; staff enter the portal without selecting which user they're viewing as.
- **Academy impersonation** — write-capable view of Vivacity Academy. Shows a dialog with user picker and reason field before entering.

The CSC primarily uses this feature to diagnose client issues, verify what a specific client user can see, and assist with onboarding. The current Portal preview mode doesn't support selecting a specific user, which limits the CSC's ability to reproduce user-specific issues.

---

## Root Cause (reported issue)

**File:** `src/components/client/ViewAsClientButton.tsx` lines 89–109

Academy mode routes through a dialog (user picker + reason field). Portal mode bypasses the dialog entirely and calls `startPreview(tenantId, undefined, null, ...)` directly.

The context auto-falls-back to the primary contact (`null ?? opts.find(is_default)`) so an `actingUserId` is technically set — but invisibly. The CSC:
- Cannot choose which user to view as
- Cannot enter a reason (so the audit log has no reason for portal sessions)
- Has no visual confirmation of who they're viewing as before entering

The infrastructure to support user selection in Portal mode already exists: `actingUserId` flows correctly through `ClientPreviewContext`, `useClientActingUser`, and `ClientTopbar`. Only the dialog trigger is missing.

---

## Agreed Design Decisions

| Decision | Resolution |
|---|---|
| Dialog for portal mode | Show the same dialog for both Portal and Academy modes |
| User picker in portal mode | Always show user picker (portal + academy); it's already useful for portal — user-specific notifications, profile, role-gated views |
| `is_vivacity_internal` gate | Keep for Academy only (write-capable); remove for portal (read-only, no elevated risk) |
| Reason field | Optional in both modes; captured in audit log for both |
| Relationship role display | Show `relationship_role` from `list_acting_user_options` as a badge in each picker option |
| Audit table `acting_user_id` | Defer to a separate DB-change session (Phase 4 below) |

---

## Phase Overview

| Phase | Description | Migration | DB Protocol | Status |
|---|---|---|---|---|
| 1 | Portal mode user picker + reason dialog | No | No | ✅ Done (18 Jun 2026) |
| 2 | Relationship role badges + common reasons presets | No | No | ✅ Done (18 Jun 2026) |
| 3 | In-session user switcher + session duration indicator | No | No | ✅ Done (18 Jun 2026) |
| 4 | `acting_user_id` column in audit table | **Yes** | **Yes** | ✅ Done (18 Jun 2026) |

---

## Phase 1 — Portal Mode User Picker + Reason Dialog

**Goal:** Fix the reported issue. CSC can select which user to view as before entering Portal preview, and a reason is captured in the audit log.

**What to change in `src/components/client/ViewAsClientButton.tsx`:**

1. Remove the early-exit portal branch (lines 89–109) that bypasses the dialog.
2. For portal mode: call `fetchActingUserOptions` and open `reasonDialogOpen` the same way Academy mode does — no `is_vivacity_internal` gate.
3. Change the `showAcademyPicker` condition from `selectedMode === "academy" || isAcademyOnly` to `true` (show picker for both modes).
4. In `handleStartPreview`, remove the ternary that nulls `acting` for portal mode:
   - Before: `const acting = selectedMode === "academy" || isAcademyOnly ? selectedActingId : null;`
   - After: `const acting = selectedActingId;`
5. Update dialog title/description to be mode-aware:
   - Portal: "View Client Portal — [TenantName]"
   - Academy: "View Vivacity Academy — [TenantName]"

**Confirm disabled condition** stays the same — picker is required in both modes if users exist.

**No other files change.** Context, hooks, and audit insert already handle `actingUserId` correctly for portal mode.

**Lovable prompt type:** UI only — no migration, no DB protocol needed.

---

## Phase 2 — Relationship Role Badges + Common Reasons Presets

**Goal:** Make the user picker and reason field faster and more informative for the CSC.

### 2a — Relationship role in user picker

`list_acting_user_options` already returns `relationship_role` (e.g. `primary_contact`, `secondary_contact`, `academy_user`). Currently the picker only shows name and "(Primary contact)" flag.

**Change:** Render `relationship_role` as a small muted badge on each `SelectItem`. Remove the special "(Primary contact)" suffix — the badge replaces it. Map raw values to readable labels (e.g. `primary_contact` → "Primary contact", `academy_user` → "Academy user").

**File:** `src/components/client/ViewAsClientButton.tsx` — `SelectItem` rendering only.

### 2b — Common reasons quick-select

Replace the freetext `Textarea` with a preset + freetext combo:

**Preset options (radio or segmented control):**
- Support ticket investigation
- Onboarding assistance
- Training new team member
- Audit preparation
- Other (free text)

When a preset is selected, pre-fill the `reason` field with that text. CSC can still edit. "Other" clears the field for free text. Audit log receives the final string.

**File:** `src/components/client/ViewAsClientButton.tsx` — dialog section only.

**Lovable prompt type:** UI only — no migration, no DB protocol needed.

---

## Phase 3 — In-Session User Switcher + Session Duration Indicator

**Goal:** Let CSC change which user they're viewing mid-session and see how long they've been in preview.

### 3a — In-session user switcher

`setActingUserId` exists in `ClientPreviewContext` and cross-tab syncs via localStorage. The preview topbar (`ClientTopbar.tsx`) currently shows the acting user's name as read-only text.

**Change:** Add a compact dropdown (or popover) to the impersonation banner in `ClientTopbar.tsx` — CSC can switch to another user in the same tenant without exiting and restarting preview. On switch, call `setActingUserId(newId)` — queries invalidate automatically.

The `actingUserOptions` array is already in context; no new RPC needed.

### 3b — Session duration indicator

`startedAt` is stored in `sessionStorage` as part of the preview session blob.

**Change:** Add a live timer in the impersonation banner (e.g. "Viewing as Angela Smith · 14 min"). Update every minute via `setInterval`. Use `startedAt` from the stored session to calculate elapsed time.

**Files:** `src/components/client/ClientTopbar.tsx` and `src/contexts/ClientPreviewContext.tsx` (expose `startedAt` from context or read directly from sessionStorage in the component).

**Lovable prompt type:** UI only — no migration, no DB protocol needed.

---

## Phase 4 — `acting_user_id` in Audit Table (Separate DB-Change Session)

**Goal:** Complete the audit trail. The `audit_client_impersonation` table currently records the actor (staff), the tenant, and the reason — but not which specific user within the tenant was viewed as.

**Trigger:** This phase involves a Supabase migration. Per the production DB change protocol, a dedicated session is required.

**Before starting Phase 4:** Read `unicorn-kb/handoffs/lovable-production-db-change.md` end-to-end. Follow the Audit → Design gate → Implementation plan → Phased implementation → Verification sequence.

**Anticipated migration:**
```sql
ALTER TABLE public.audit_client_impersonation
  ADD COLUMN acting_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;
```

**Application changes:**
- `ClientPreviewContext.startPreview()` — pass `resolvedActingId` in the audit insert
- `setActingUserId()` — update the audit row when user is switched mid-session (Phase 3)
- RLS on the new column inherits from the existing table policy (Vivacity staff only)

**Audit entry required** at session end per the production DB change protocol.

---

## Notes

- Phases 1–3 are independent of Phase 4 and can be run in any order.
- Phase 1 is the prerequisite for Phase 3 (switching implies you already selected a user on entry).
- Phase 3a (user switcher) and Phase 4 (audit `acting_user_id`) are coupled — if the switcher ships before Phase 4, mid-session user switches won't be recorded in the audit table. This is acceptable as an interim state; Phase 4 closes the gap.
- The `is_vivacity_internal` flag remains an Academy-only gate throughout all phases.
