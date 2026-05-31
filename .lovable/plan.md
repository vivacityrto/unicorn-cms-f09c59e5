# Fix: cannot close an Issue/Opportunity

## Root cause

`useRisksOpportunities.updateItem` validates the status change against rows in `public.eos_issue_status_transitions` (via `useEosStatusTransitions` + `isValidStatusTransition`). The current table only allows these paths to `Closed`:

- `Escalated → Closed`
- `Solved → Closed`

There is no `Open → Closed` row, so picking "Closed" on an Open item throws the toast shown in the screenshot:
`Invalid status transition: "Open" → "Closed". Allowed transitions from "Open": Discussing, In Review, Archived`.

No code is broken — the workflow data is just too strict for what the UI exposes (the status dropdown lets users pick Closed from any state).

## Change

Single data migration on `public.eos_issue_status_transitions` — insert the missing direct-to-Closed transitions so users can close an item from any active working state. No schema, RLS, grant, function, or app code changes.

Add rows (idempotent `ON CONFLICT DO NOTHING`):

- `Open → Closed`
- `Discussing → Closed`
- `Actioning → Closed`
- `In Review → Closed`

`Solved → Closed` and `Escalated → Closed` already exist and stay. `Archived → Closed` is intentionally **not** added (Archived is a terminal storage state; the existing `Archived → Open` reopen path is preserved).

## Out of scope

- No change to `useRisksOpportunities.tsx`, the status dropdown, or the EOS options hook.
- No change to other transitions (Discussing/Actioning/etc. workflow stays as-is).
- No change to `eos_issues` table, RLS, or triggers.

## Verification

After approval and migration run:
1. On `/eos/risks-opportunities`, change an Open item's status to `Closed` — should succeed with "Item updated successfully".
2. Existing transitions (Open → Discussing, Solved → Closed, etc.) continue to work.
