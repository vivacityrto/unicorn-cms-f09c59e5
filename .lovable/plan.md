## Home Phase 1B-B v2 — Client feed sections + 1B-A cleanup

Adds three real-data sections and one stubbed Vivacity Services section to `ClientHomePage`, sourced from a single new view. Strictly client-facing — no `eos_*`, no `meetings`, no staff attribution. Also cleans up legacy widgets that should have been removed in 1B-A.

### 1. Migration — `v_client_home_feed`

`supabase/migrations/<ts>_v_client_home_feed.sql`. `CREATE OR REPLACE VIEW … WITH (security_invoker = true)`, UNION ALL across:

- **coming_up** — open `client_action_items` due in next 84 days; released, incomplete `client_task_instances` due in next 84 days (package not complete).
- **needs_attention** — overdue CAIs; overdue released CTIs; `notes` (parent_type `package_instance`, pinned, body matches `(urgent|overdue|action required)`).
- **recent_activity** (last 30 days, `pi.is_complete = false`, `te.start_at >= pi.start_date`) — `time_entries`, `stage_instances` completed (`status_id IN (2,3)`), `stage_instances` released, completed CAIs.

Output columns: `feed_section, event_type, tenant_id (bigint), package_instance_id, event_at (timestamptz), title, subtitle, event_uid, source_table, href`. `GRANT SELECT TO authenticated`. View comment documents intent + invariants. SQL body as in the prompt.

After apply, run sanity SELECTs (AHMRC `tenant_id = 7449` distribution + cross-platform tenant counts per section).

### 2. Hook — `src/hooks/use-client-home-feed.ts`

Single TanStack query `['client_home_feed', activeTenantId]` from `useClientTenant`, `staleTime: 60_000`, `.eq('tenant_id', activeTenantId)`, ordered by `event_at desc`. `useMemo` partitions:

- `comingUp` — asc by `event_at`, slice 5
- `needsAttention` — asc by `event_at` (oldest overdue first)
- `recentActivity` — desc by `event_at`, slice 8

Exports typed `HomeFeedSection`, `HomeFeedEventType`, `HomeFeedRow`, `UseClientHomeFeedResult`. No `any`.

### 3. Components — `src/components/client/home/`

- **`HomeNeedsAttentionSection.tsx`** — hides when empty. Amber-bordered card (`border-amber-200 bg-amber-50/50`), `AlertCircle` icon, rows clickable to `event.href`, "Due X days ago" relative time on right.
- **`HomeComingUpSection.tsx`** — hides when empty (and not loading). 3 skeletons while loading. `CheckSquare` blue icon, "in N days" via `formatDistanceToNow(parseISO(event_at), { addSuffix: true })`.
- **`HomeVivacityServicesSection.tsx`** — always visible, no data. 4-card grid (2×2 desktop, 1-col mobile): Reporting Reminders (`BellRing`), Upcoming Events (`CalendarPlus`), Superhero Tools Unleashed (`Sparkles`), Trainer PD (`GraduationCap`). Each carries a "Coming soon" pill. Brand-purple icon accents; non-interactive.
- **`HomeRecentActivitySection.tsx`** — hides when empty. 4 skeletons while loading. Icon by `event_type` (`Phone` blue / `CheckCircle2` emerald / `Send` violet / `CheckSquare` emerald). For `consult_logged` rows, run `title`/`subtitle` through `formatWorkType` from `src/components/client/package-dashboard/formatters.ts`. Rows non-interactive in v1. Right side: `formatDistanceToNow(..., { addSuffix: true })`.

### 4. Wire-up + 1B-A cleanup — `src/components/client/ClientHomePage.tsx`

Current render confirmed: the audit conditional `showAuditEmpty ? <AuditReadinessEmpty /> : <AuditReadinessCard />` is already correct (line 402). The duplicate "0% Audit Ready" pill is being rendered by one of the legacy widgets (likely `MomentumBanner` or `ProgressAnchors`); removing them resolves Bug 1 naturally.

**Remove JSX usages and imports** (files stay on disk) of:

- `<MomentumBanner />` (+ `useMomentumState`, `primaryMomentum`)
- `<ProgressAnchors />`
- `<AttentionPanel />`
- `<ActivityTimeline />`
- `<ClientActionPlanSection />` — the "My Action Plan" empty-celebration card

Leave untouched: `<CSCCard>`, audit empty/non-empty conditional, `<PackagesStrip>`, `<QuickActionsRow>`, `<ClientUpcomingAuditSection>`, `<AuditPreparationSection>`, `<ClientAuditReportsSection>`, Quick links footer.

**Insert in this order** after `<QuickActionsRow>`, wrapped in `space-y-6`:

1. `<HomeNeedsAttentionSection events={feed.needsAttention} />`
2. `<HomeComingUpSection events={feed.comingUp} isLoading={feed.isLoading} />`
3. `<HomeVivacityServicesSection />`
4. `<HomeRecentActivitySection events={feed.recentActivity} isLoading={feed.isLoading} />`

Call `useClientHomeFeed()` once at top of component.

If after deploy the duplicate "0% Audit Ready" pill or "999 days" banner persists, search for the source by visible copy (`rg "Audit Ready"`, `rg "999"`, `rg "Action required to continue"`) and remove that surface too.

### 5. Sanity / acceptance

Smoke-check AHMRC (calm state — Needs Attention hidden, Coming Up hidden, Vivacity Services visible, Recent Activity populated), a tenant with overdue CAIs (Needs Attention amber card), and a brand-new tenant (only Vivacity Services + hero). Confirm no `eos_*` / `meetings` / staff-name leakage; build clean; no `any`.

### Out of scope

Real data behind Vivacity Services cards, replacement My Action Plan surface for tenants with audits, deletion of legacy widget files, realtime subscriptions.
