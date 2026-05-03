# Home Phase 1C — Reporting Reminders UI

UI-only. The `compliance_obligations` table and `v_client_reporting_reminders` view are already live; no SQL changes.

## Files

### 1. New — `src/hooks/use-client-reporting-reminders.ts`
React Query hook over `v_client_reporting_reminders`, scoped to `useClientTenant().activeTenantId`, ordered by `sort_order`. Exports `ClientReportingReminder`, `ReminderStatus`, `ReminderRecurrence`, `ReminderAudience` types. `staleTime: 10min`. No `any`.

### 2. New — `src/components/client/home/HomeReportingRemindersCard.tsx`
Self-fetching card. Layout per prompt:

- Header: `BellRing` (purple) + "Reporting reminders" + subtitle "Your annual compliance calendar."
- Default visible subset: all `overdue` (asc by `days_until`), all `due_soon` (asc), up to 2 `upcoming`, up to 2 `always_open`.
- Local `useState` expander → "Show all N obligations" reveals the rest (preserves `sort_order` for the additional rows).
- Row: status icon (left) + title (`font-medium truncate`) + description (`text-sm text-muted-foreground line-clamp-2`) + date line + CTA link (`text-primary text-xs hover:underline` + `ExternalLink` 12px, `target="_blank" rel="noopener noreferrer"`) + status pill (right).
- Status → pill/icon mapping exactly as specified (overdue=destructive/AlertTriangle red-600, due_soon=amber bg+border/Clock amber-600, upcoming=outline/Calendar slate-500, always_open=secondary/Infinity muted, no_date=secondary/RefreshCw muted).
- Date line copy:
  - overdue → `Was due {format(d,'d MMM yyyy')} ({Math.abs(days_until)} days ago)`
  - due_soon / upcoming → `Due {…} (in {days_until} days)`
  - always_open / no_date → omitted
- States: 4 skeleton rows on loading; small inline alert on error; `return null` when `data.length === 0`.
- Mobile (`<md`): pill drops below title; CTA wraps to its own row; description clamps to 2 lines.

### 3. Edit — `src/components/client/home/HomeVivacityServicesSection.tsx`
- Drop the "Reporting reminders" entry from `SERVICES` (keep Events, Tools, PD).
- Render `<HomeReportingRemindersCard />` at full width above the stub grid.
- Conditional reflow: use `useClientReportingReminders` here too (cheap — same React Query cache key) to detect empty/hidden state. When the live card is hidden, render the three remaining stubs as a 3-card grid (`sm:grid-cols-3`); when visible, stack live card on top + 3-card row below. Section heading changes to "From Vivacity".

## Technical notes

- Reuses `formatDistanceToNow`/`format` from `date-fns` (already in project).
- All shadcn primitives reused (`Card`, `CardContent`, `Badge`, `Skeleton`, `Alert`, `Button`).
- Tenant scoping via `.eq('tenant_id', activeTenantId)` on top of view's `security_invoker` RLS.
- No new dependencies, no `any`, Australian `d MMM yyyy` formatting, no edits outside the three files above.

## Out of scope

EOS/L10, Scorecards, audit module, dashboard track, the other three stub cards, mark-as-done, email reminders, `window_opens_at` rendering, registration-renewal date computation.
