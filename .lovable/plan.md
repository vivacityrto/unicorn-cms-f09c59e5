# Home page Phase 1B-A — Hero, CSC card, packages strip, quick actions

## Verified facts before planning

- **Route**: `/client/home` → `src/pages/client/ClientHomeWrapper.tsx` → `src/components/client/ClientHomePage.tsx` (the file to restructure).
- **Existing progress hook**: `useClientProgress(tenantId)` at `src/hooks/useClientProgress.ts` already wraps `v_client_dashboard_progress` and returns rows with `package_name`, `current_phase_name`, `phase_completion`, `steps_remaining`, `risk_state`, `package_instance_id`. Reuse as-is — no changes.
- **Schema confirmed** for `tenant_csc_assignments` (`tenant_id`, `csc_user_id`, `role_label`, `is_primary`, `assigned_since`), `package_instances` (`tenant_id`, `start_date`, `is_complete`), `client_audits` (`subject_tenant_id`), `tenants` (`id`, `name`, `legal_name`), `users` (`first_name`, `last_name`, `email`, `avatar_url`, `user_uuid`).
- **Avatar field**: project convention is `avatar_url` (full public URL, used directly via `<AvatarImage src=…/>`). View will expose `csc_avatar_url`, not `csc_avatar_path`.
- **Existing helpers on the current page**: `useAuth().profile`, `useClientActingUser()` (gives the impersonated first_name), `useClientTenant().activeTenantId`, `useHelpCenter()`, `useOpenDocumentRequest()`. All retained.
- **AuditReadinessCard** already exists and renders nothing when there's no progress data; we'll wrap the page logic so when `audits_total === 0` we render the new empty-state pill instead.
- **Sections in Phase 1B-A scope only**: hero, CSC card, packages strip, audit-readiness empty-state, quick actions row. The lower sections (Attention, Activity Timeline, Action Plan, etc.) stay where they currently render — only their order/wrapping changes minimally.

## What gets built

### 1. Migration — `v_client_home_hero`

Strictly additive view, `security_invoker = true`:

- CTE `csc_primary` — `DISTINCT ON (tenant_id)` from `tenant_csc_assignments` joined to `users`, ordered by `is_primary DESC, assigned_since DESC NULLS LAST`. Picks one CSC per tenant, preferring the primary, then the most recently assigned.
- CTE `package_aggregates` — per-tenant `MIN(start_date)` (tenure anchor), counts of total / active / historical from `package_instances`.
- CTE `audit_count` — total `client_audits` per `subject_tenant_id`.
- Outer `SELECT` — left-joins all three onto `tenants`, exposing: `tenant_id`, `tenant_name`, `tenant_legal_name`, `member_since`, `total_packages_ever`, `active_packages`, `historical_packages`, `csc_user_id`, `csc_display_name`, `csc_first_name`, `csc_email`, `csc_avatar_url`, `csc_role_label` (defaulting to `'CSC'`), `audits_total`.

`GRANT SELECT … TO authenticated`. Comment explains purpose.

### 2. Hook — `src/hooks/use-client-home-hero.ts`

`useClientHomeHero()` using TanStack Query. Reads `activeTenantId` from `useClientTenant()`, gates with `enabled: !!activeTenantId`, explicit `.eq('tenant_id', activeTenantId!)`, `.maybeSingle()`. `staleTime: 5 * 60_000`. Exports a typed `ClientHomeHero` interface — no `any`.

### 3. Component restructure — `ClientHomePage.tsx`

Replace the welcome block + the three ad-hoc "What do you need?" cards with the new structure. Keep all other section components in place, just reorder.

**New order**:

```text
[Hero greeting + tenure tag]
[CSC card]
[Audit-readiness pill (empty-state aware)]
[Your packages strip]
[Quick actions row]
[MomentumBanner] (unchanged)
[ProgressAnchors] (unchanged)
[ClientUpcomingAuditSection] (unchanged)
[AuditPreparationSection] (unchanged)
[ClientAuditReportsSection] (unchanged)
[ClientActionPlanSection] (unchanged)
[AttentionPanel] (unchanged)
[ActivityTimeline] (unchanged)
[Quick links footer] (unchanged)
```

The original `<ClientProgressSummary>` and the three "Ask the Chatbot / Request a document / Support" cards are removed (their function moves into the new strip + quick actions row). The `AuditReadinessCard` import stays available for non-empty states; the page renders it when `hero.audits_total > 0` and renders the new empty-state pill when zero.

**New helpers (inline in the page file)**:

- `timeAwareGreeting(now)` — uses `Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false })` to derive Sydney hour, returns "Good morning" / "Good afternoon" / "Good evening".
- `formatTenure(memberSinceISO)` — returns "Member of Vivacity" if null, else `Member since {format(d, 'd MMM yyyy')} · {duration}`. Duration computed via `differenceInMonths` from `date-fns`: `<12` → "N months"; `>=12` → "Y years" or "Y years M months" if remainder; if total months is 0, drop the duration entirely.
- `getInitials(name)` — splits on whitespace, two letters max, uppercase, fallback "?".

**Hero block**: large `h1` "Good morning, Chris" with the tenure line as muted `text-sm` underneath.

**CSC card** (shadcn `Card`): avatar (image from `csc_avatar_url`, fallback initials), label "Your {csc_role_label}", display name, email below in muted text. Two buttons on the right: "Message" (opens help center), "Book consult" (links to `/client/calendar` if it exists, otherwise opens help center). When `csc_user_id` is null, name shows "Not yet assigned" and both buttons are disabled inside a `Tooltip` with content "Your CSC assignment is pending — contact info@vivacity.com.au".

**Audit-readiness empty state**: when `hero.audits_total === 0`, render a small `Card` with `ShieldCheck` icon and copy "No audits yet — your CSC will set one up when it's time." Otherwise render the existing `<AuditReadinessCard />`.

**Your packages strip**: consumes `useClientProgress(activeTenantId)`. Renders a card containing an ordered list of `PackageStripRow` items. Each row:

- Left: small `Briefcase` icon + `package_name` (truncate on overflow)
- Right: a status badge derived from `risk_state` (cyan tone for `on_track`, amber for `needs_attention`, red for `action_required`) plus a "View →" link to `/client/packages`
- Sub-line in muted `text-xs`: `{phase_completion}% complete · {steps_remaining} stages remaining · Currently in {current_phase_name}` with the documented edge cases (no current phase, total stages = 0)

Empty state: "No active packages right now."

**Quick actions row**: 4 cards (3 on tablet 2x2, stacked on mobile) using existing handlers:

1. **Book consult** → links to `/client/calendar`
2. **Message CSC** → `openHelpCenter('chatbot')` (existing wired action)
3. **Request document** → `openDocumentRequest()` (existing wired action)
4. **Ask the Chatbot** → `openHelpCenter('chatbot')` (kept since it's already wired)

"Open audit workspace" is omitted because there's no existing route handler for it (per the prompt's guidance: don't fabricate routes).

### 4. No file removed

Existing components (`ClientProgressSummary`, `AuditReadinessCard`, etc.) stay on disk — only their import/usage in `ClientHomePage.tsx` changes. `useClientProgress` is reused unchanged.

## What is NOT changed

- `v_client_dashboard_progress`, `v_client_package_dashboard`, or any other shipped view.
- Any base table.
- Other client-portal pages (Packages, Documents, Calendar, etc.).
- EOS/L10, Scorecards, audit module, Vivacity Academy.
- The "Action required" momentum banner (epoch fix is a separate prompt).
- The bottom Quick Links footer.

## RLS / security notes

- `security_invoker = true` on the new view defers to existing RLS on `tenant_csc_assignments`, `users`, `package_instances`, `client_audits`, and `tenants`.
- Hook adds explicit `.eq('tenant_id', activeTenantId)` for belt-and-braces and so the query URL carries the tenant scope.
- No new mutations, no new tables.

## Sanity SQL after migration

I'll run via `supabase--read_query`:

```sql
SELECT tenant_name, member_since, active_packages, historical_packages,
       csc_display_name, csc_role_label, audits_total
FROM v_client_home_hero WHERE tenant_id = 7449;

SELECT CASE WHEN csc_user_id IS NULL THEN 'no_csc' ELSE 'has_csc' END AS csc_state,
       COUNT(*) AS n
FROM v_client_home_hero GROUP BY 1;
```

Expected for AHMRC: CSC=Angela Connell-Richards, member_since=2022-11-30, active=1, historical=3, audits=0.

## Files touched

- `supabase/migrations/<timestamp>_v_client_home_hero.sql` (new — applied via migration tool)
- `src/hooks/use-client-home-hero.ts` (new)
- `src/components/client/ClientHomePage.tsx` (restructured: hero, CSC card, audit-readiness empty state, packages strip, quick actions row; lower sections retained)

No other files modified.
