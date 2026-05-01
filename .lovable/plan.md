# Wire Academy hub sub-tabs to actually filter by tag

## Goal

Replace the hard-coded sub-tab labels in each Vivacity Academy hub with the agreed labels mapped to real `academy_courses.tags` values, filter the course grid via array overlap, and show counts per tab. Default "All" preserves current behaviour. No DB or RLS changes.

## Approach

Each hub already calls `useAcademyCourses({ audienceKey })`, which returns the full per-persona course list with `tags: string[]` included. Since the per-persona list is small (≤27 published courses) and already in memory, **filtering happens client-side via array overlap**. This:

- avoids extra round-trips per tab click,
- lets us render accurate counts on every tab without additional queries,
- is functionally equivalent to a server-side `.overlaps('tags', [...])` filter.

A shared shape is used in each hub:
```ts
const categoryTabs: { label: string; tags: string[] }[] = [
  { label: "All", tags: [] },
  // ...
];
const matchesTab = (c, tags) => tags.length === 0 || (c.tags ?? []).some(t => tags.includes(t));
```

Tab labels render as `"<Label> (<count>)"` where count is the courses on that hub matching the tab's tag list. Empty-state and loading-state markup is unchanged.

## Files to change

### 1. `src/pages/client/TrainerHubPage.tsx`
Replace `categoryTabs` with:
- All
- TAS → `['tas']`
- Assessment → `['assessment','assessment-validation','assessment-tools']`
- Online Delivery → `['online-delivery']`
- Job Trainer → `['job-trainer']`
- PD → `['trainer-pd','professional-development']`

Update `filtered` derivation and the tab `<button>` map to render counts.

### 2. `src/pages/client/ComplianceManagerPage.tsx`
- All
- Standards → `['standards','srto-2025','standards-2025']`
- CRICOS → `['cricos']`
- Audits → `['audit']`
- Workshops → `['workshop']`
- Webinars → `['webinar']`

### 3. `src/pages/client/GovernancePersonPage.tsx`
- All
- Strategic Planning → `['strategic-planning']`
- Leadership → `['leadership']`
- Marketing & Brand → `['marketing','branding']`
- RTO Startup → `['rto-startup']`

### 4. `src/pages/client/StudentSupportOfficerPage.tsx`
- All
- Online Delivery → `['online-delivery']`
- Induction → `['induction']`

### 5. `src/pages/client/AdministrationAssistantPage.tsx`
- All
- Strategic Planning → `['strategic-planning']`
- Marketing & Brand → `['marketing','branding']`
- Customer Experience → `['customer-experience']`
- Induction → `['induction']`

In every hub, the count next to each tab is derived from the in-memory `courses` array using the same `matchesTab` helper. The empty state already exists ("No courses available yet — More courses coming soon — check back shortly") and is reused for empty sub-tabs.

## Acceptance

- Each "All" tab shows the same courses as today.
- Each sub-tab shows only courses whose `tags` overlap the configured list.
- Tab labels show counts, e.g. "TAS (2)".
- Empty sub-tabs render the existing friendly empty state.
- No DB, RLS, or hook changes.
