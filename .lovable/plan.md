# KPI Dashboard widget — data verification

I traced the widget end-to-end against the live DB for your signed-in user (angela@vivacity.com.au, user_uuid `611a7972-…14f0`, `kpi_role = csc_consultant`) for the current period **July 2026**.

## What the widget renders vs live data

| Row | UI shows | Live DB result | Match |
|---|---|---|---|
| Overall this period | 100% | avg of decided rows = 100% (only Retention has decided data) | Yes |
| Retention | 100% — 8/8 retained, target 100% | `kpi_csc_retention_rows` returns 8 stints, 0 churned in period → 100% | Yes |
| Communication | — no messages, target 80% | `kpi_csc_communication_rows` returns 0 attributed client-initiated messages in July → `pct = null` (displayed as "—") | Yes |
| Tasks | — no tasks, target 90% | `kpi_csc_tasks_rows` returns 0 `client_team_tasks` created in July for tenants where you are CSC → `pct = null` | Yes |

The 8 retained clients are: Total Training Solutions Adelaide, Vivacity Coaching & Consulting, AHMRC Training, Dijan Training Program, Smart Nation Education, TAE Institute, Absolute Medical Response, Upskill You. All have `churned_at IS NULL`.

## How it's wired (for the record)

- `src/pages/MainDashboard.tsx` renders `<MiniKpiSummary subjectUuid={userUuid} period={defaultPeriod()} role={profile.kpi_role} />`.
- `src/components/kpi-v2/MiniKpiSummary.tsx` calls `fetchRetention`, `fetchCommunication`, `fetchCscTasks` in `src/lib/kpi-v2/fetchers.ts`.
- Each fetcher invokes the corresponding `kpi_csc_*_rows` Postgres RPC with a half-open `[p_start, p_end)` window (July 2026).
- "Overall" is the arithmetic mean of the rows whose `pct` is not null — so with only Retention decided, Overall = Retention = 100%. That is expected behaviour, not a bug.

## Recommendation

No changes required — the widget is showing live, accurate data. Two optional follow-ups if you want them (say the word and I'll plan them separately):

1. Show a small "based on 1 of 3 metrics" hint under **Overall this period** when some rows are `—`, so 100% doesn't look inflated.
2. When Communication/Tasks are `—`, render a lighter "No activity this period" label instead of a target-only footer, to distinguish "no data" from "0% performance".
