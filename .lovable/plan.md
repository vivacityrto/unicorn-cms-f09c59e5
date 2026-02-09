

## Client Page Cleanup and "View as Client" Integration

This plan restructures the Client Detail page (`/clients/:tenantId`) into clearly separated zones and integrates the existing "View as Client" button into the page header.

---

### Part A: Header Restructure

**Current state:** The header mixes identity info (name, slug, CSC), operational controls (time widget, timer, package selector, risk badge, "Add time from meeting" button), and a package counter all in one horizontal row. This creates visual density.

**Changes to `ClientDetail.tsx` header section (lines 156-236):**

1. **Primary header row** -- Organisation Name + Status badge + Risk badge + CSC assignment + action buttons only
   - Keep `tenant.name` as `h1`
   - Keep Status badge (active/inactive)
   - Keep `RiskLevelBadge` inline with badges
   - Keep `CSCAssignmentSelector` below the name
   - **Add `ViewAsClientButton`** next to Save Changes (top-right)
   - **De-emphasise slug**: Change from `<p>` to a small `text-xs text-muted-foreground` tooltip or inline metadata: `slug: {tenant.slug}` in muted small text

2. **Remove from header row:**
   - `ClientTimeWidget` (timer, month total, package usage badge, package selector)
   - "Add time from meeting" button
   - Package count `div`

These controls move into the page body as part of the Engagement Snapshot or remain accessible via the Overview tab.

---

### Part B: Four-Zone Page Body

Restructure the Overview tab content into clear card-based sections:

#### Zone 1: Identity and Registration (read-only card)
- Existing `ClientProfileForm` already covers RTO number, CRICOS, legal name, trading name, ABN, ACN, org type
- Existing `ClientAddressSection` below it
- No changes needed here, already well structured

#### Zone 2: Engagement Snapshot (new summary section on Overview)
- Move `ClientTimeSummaryCard` to sit at top of Overview (already does this)
- Move `ClientTimeWidget` (timer controls) into a compact bar above or within the time summary card
- Move "Add time from meeting" button into the time summary area
- Move package count into the engagement snapshot area
- **Conditionally hide** the Package Burn-down card when no active package has included hours (already handled -- shows "No active package" message, but we can hide the entire card)

#### Zone 3: Work Tabs (keep existing, minor cleanup)
- Keep all existing tabs: Overview, Packages, Documents, Users, Notes, Actions, Emails, SharePoint, Timeline, Integrations
- No structural changes to tab content

#### Zone 4: Internal-Only Controls (visual separation)
- Wrap the Notes tab content and risk/internal actions with a subtle "Vivacity Internal" label or border treatment
- The Notes tab already is internal-only by nature -- just add a small indicator badge on the tab

---

### Part C: "View as Client" Button in Header

**Current state:** `ViewAsClientButton.tsx` already exists with full functionality -- dropdown for portal vs academy, reason dialog, audit logging, navigation to `/client-preview`.

**Changes:**
1. Import `ViewAsClientButton` into `ClientDetail.tsx`
2. Place it in the header actions area (top-right), next to the Save Changes button
3. Pass required props: `tenantId`, `tenantName`, tenant type from profile or tenant data
4. The button already handles its own visibility check (`canUsePreview` from `ClientPreviewContext`)

The existing `ImpersonationBanner` component already provides the fixed "Viewing as Client" banner with exit button when preview mode is active.

---

### Technical Details

**Files to modify:**
- `src/pages/ClientDetail.tsx` -- Main restructure:
  - Import `ViewAsClientButton`
  - Restructure header: name + badges + CSC on left, ViewAsClient + Save on right
  - De-emphasise slug to `text-xs` metadata
  - Move time widget, package count, and "Add time from meeting" out of header into Overview tab body
  - Add an "Engagement Controls" bar at top of Overview tab with timer widget + add time button + package count

**Files unchanged:**
- `ViewAsClientButton.tsx` -- Already complete
- `ImpersonationBanner.tsx` -- Already complete
- `ClientPreviewContext.tsx` -- Already complete
- `ClientProfileForm.tsx` -- Already correct for Zone 1
- `ClientTimeSummaryCard.tsx` -- Already correct for Zone 2
- No database/schema changes required

**Estimated scope:** Single file edit (`ClientDetail.tsx`), approximately 50-80 lines restructured.

