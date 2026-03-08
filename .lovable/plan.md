

## Plan: Refactor EOS Scorecard with Metric Management Actions

### Schema Changes (Migration)

Add 3 columns to `eos_scorecard_metrics`:

```sql
ALTER TABLE public.eos_scorecard_metrics
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS direction text DEFAULT 'higher_is_better' CHECK (direction IN ('higher_is_better', 'lower_is_better', 'equals_target')),
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
```

No other table changes needed — `owner_id`, `display_order` already exist.

### Type Updates

**`src/types/eos.ts`** — Add `category`, `direction`, `is_archived` to `EosScorecardMetric`:
```typescript
export interface EosScorecardMetric {
  // ...existing fields...
  category?: string;
  direction?: 'higher_is_better' | 'lower_is_better' | 'equals_target';
  is_archived?: boolean;
}
```

### Hook Changes

**`src/hooks/useEosScorecardMetrics.tsx`**:
- Change filter from `.eq('is_active', true)` to also exclude archived: `.eq('is_archived', false)` (or handle via a toggle).
- Add `updateMetric`, `archiveMetric`, and `deleteMetric` mutations.
- `archiveMetric`: sets `is_archived = true` and `is_active = false`.
- `deleteMetric`: hard-deletes only metrics with zero entries (check count first), otherwise toast an error suggesting archive.
- All mutations invalidate `['eos-scorecard-metrics']`.

### UI Changes

#### 1. MetricEditorDialog (`src/components/eos/MetricEditorDialog.tsx`)
- Accept optional `metric` prop for edit mode (pre-fill form).
- Add fields: **Category** (text input), **Owner** (dropdown of tenant users via existing hook), **Direction** (select: Higher is Better / Lower is Better / Equals Target).
- On submit: call `insert` for new or `update` for existing.

#### 2. ScorecardEntryGrid (`src/components/eos/ScorecardEntryGrid.tsx`)
- Add a `DropdownMenu` (three-dot icon) in the card header with: **Edit Metric**, **Archive Metric**, **Delete Metric**.
- Edit opens `MetricEditorDialog` with the metric pre-filled.
- Archive calls `archiveMetric` with a confirmation dialog.
- Delete calls `deleteMetric` with a destructive confirmation dialog.
- Fix `isOffTrack` logic to use `metric.direction`:
  - `higher_is_better`: off-track if `value < target`
  - `lower_is_better`: off-track if `value > target`
  - `equals_target`: off-track if `value !== target`
- Show a status badge on each metric card header: "On Track" (green) / "Off Track" (red) / "No Data" (muted) based on latest entry + direction.
- Display `category` and `owner` (resolved name) as badges alongside existing target/frequency badges.

#### 3. EosScorecard page (`src/pages/EosScorecard.tsx`)
- Add "Show Archived" toggle to view archived metrics separately.
- Pass edit state down to `MetricEditorDialog`.

### Direction-Aware Status Logic

```typescript
function isOffTrack(value: number, target: number, direction: string): boolean {
  switch (direction) {
    case 'lower_is_better': return value > target;
    case 'equals_target': return value !== target;
    case 'higher_is_better':
    default: return value < target;
  }
}
```

### Audit Logging

Each mutation (create, update, archive, delete) will insert a row into `client_audit_log` with `entity_type: 'eos_scorecard_metric'`, `action`, `entity_id`, `performed_by`, and `tenant_id`.

### Files to Edit
1. **Migration SQL** — add `category`, `direction`, `is_archived` columns
2. `src/types/eos.ts` — update `EosScorecardMetric` interface
3. `src/hooks/useEosScorecardMetrics.tsx` — add update/archive/delete mutations + audit logging
4. `src/components/eos/MetricEditorDialog.tsx` — add new fields, support edit mode
5. `src/components/eos/ScorecardEntryGrid.tsx` — add actions menu, direction-aware status, owner/category badges
6. `src/pages/EosScorecard.tsx` — wire edit state, add archived toggle

