
# EOS Rocks Hierarchy Implementation Plan

## Overview

This plan implements a strict EOS Rock hierarchy (Company → Team → Individual) for Vivacity Coaching & Consulting's internal operations. The hierarchy ensures:
- Company Rocks (3–7 per quarter) cascade to Team Rocks
- Team Rocks (per function) cascade to Individual Rocks
- Status roll-up: if any child is off-track, parent is off-track
- All rocks align to the company mission via the V/TO

## Current State Analysis

### Existing Infrastructure

| Component | Status |
|-----------|--------|
| `eos_rocks` table | Exists with `level` field (unused) |
| `accountability_functions` | Exists - can be used for Team Rocks |
| `accountability_seats` | Exists - can be used for Company Rock ownership |
| `eos_vto` table | Exists - contains `ten_year_target` (mission equivalent) |
| `eos_rock_status` enum | Exists: `Not_Started`, `On_Track`, `At_Risk`, `Off_Track`, `Complete` |
| RLS/RBAC | Already restricts EOS to Vivacity Team only |

### Key Observations
1. The `level` column already exists in `eos_rocks` but is not enforced
2. No `parent_rock_id` column exists for hierarchy linkage
3. VTO's `ten_year_target` serves as the mission (no separate mission table)
4. Status enum already has the required values (just needs lowercase normalization)

---

## Phase 1: Database Schema Changes

### 1.1 Add New Columns to `eos_rocks`

```sql
ALTER TABLE eos_rocks
  ADD COLUMN IF NOT EXISTS rock_level text DEFAULT 'company'
    CHECK (rock_level IN ('company', 'team', 'individual')),
  ADD COLUMN IF NOT EXISTS parent_rock_id uuid REFERENCES eos_rocks(id),
  ADD COLUMN IF NOT EXISTS function_id uuid REFERENCES accountability_functions(id),
  ADD COLUMN IF NOT EXISTS vto_id uuid REFERENCES eos_vto(id),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
```

### 1.2 Add Hierarchy Constraints

```sql
-- Company rocks: no parent, must link to VTO
ALTER TABLE eos_rocks ADD CONSTRAINT chk_company_rock
  CHECK (rock_level != 'company' OR (parent_rock_id IS NULL AND vto_id IS NOT NULL));

-- Team rocks: must have company parent and function
ALTER TABLE eos_rocks ADD CONSTRAINT chk_team_rock
  CHECK (rock_level != 'team' OR (parent_rock_id IS NOT NULL AND function_id IS NOT NULL));

-- Individual rocks: must have team parent and owner
ALTER TABLE eos_rocks ADD CONSTRAINT chk_individual_rock
  CHECK (rock_level != 'individual' OR (parent_rock_id IS NOT NULL AND owner_id IS NOT NULL));
```

### 1.3 Add Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_eos_rocks_parent ON eos_rocks(parent_rock_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_level ON eos_rocks(rock_level);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_function ON eos_rocks(function_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_quarter ON eos_rocks(quarter_year, quarter_number);
```

### 1.4 Migration Script

```sql
-- Set existing rocks to company level
UPDATE eos_rocks SET rock_level = 'company' WHERE rock_level IS NULL;

-- Link to active VTO
UPDATE eos_rocks r
SET vto_id = (
  SELECT id FROM eos_vto 
  WHERE tenant_id = r.tenant_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1
)
WHERE rock_level = 'company' AND vto_id IS NULL;

-- Normalize status values
UPDATE eos_rocks SET status = lower(replace(status, '_', '_'))
WHERE status IS NOT NULL;
```

### 1.5 Status Roll-up Function

```sql
CREATE OR REPLACE FUNCTION compute_rock_rollup_status(rock_id uuid)
RETURNS text AS $$
DECLARE
  child_count int;
  off_track_count int;
  complete_count int;
  own_status text;
BEGIN
  SELECT status INTO own_status FROM eos_rocks WHERE id = rock_id;
  
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('off_track', 'Off_Track')),
    COUNT(*) FILTER (WHERE status IN ('complete', 'Complete'))
  INTO child_count, off_track_count, complete_count
  FROM eos_rocks WHERE parent_rock_id = rock_id;
  
  IF child_count = 0 THEN
    RETURN own_status;
  END IF;
  
  IF off_track_count > 0 THEN
    RETURN 'off_track';
  END IF;
  
  IF complete_count = child_count THEN
    RETURN 'complete';
  END IF;
  
  RETURN 'on_track';
END;
$$ LANGUAGE plpgsql;
```

---

## Phase 2: Type Definitions

### 2.1 Update `src/types/eos.ts`

```typescript
export type RockLevel = 'company' | 'team' | 'individual';

export interface EosRock {
  id: string;
  tenant_id: number;
  title: string;
  description?: string;
  issue?: string | null;
  outcome?: string | null;
  milestones?: unknown;
  
  // Hierarchy fields
  rock_level: RockLevel;
  parent_rock_id?: string | null;
  function_id?: string | null;
  vto_id?: string | null;
  
  // Ownership
  seat_id?: string | null;
  owner_id?: string | null;
  
  // Timing
  quarter_year: number;
  quarter_number: number;
  due_date: string;
  completed_date?: string;
  
  // Status
  status: string;
  priority?: number;
  sort_order?: number;
  archived_at?: string | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: string;
  client_id?: string | null;
}

export interface RockWithChildren extends EosRock {
  children?: EosRock[];
  rollupStatus?: string;
  childStats?: {
    total: number;
    complete: number;
    offTrack: number;
  };
}
```

---

## Phase 3: Hooks Updates

### 3.1 New Hook: `src/hooks/useEosRocksHierarchy.tsx`

```typescript
export function useEosRocksHierarchy() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  // Fetch all rocks with hierarchy data
  const { data: rocks, isLoading } = useQuery({
    queryKey: ['eos-rocks-hierarchy', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select(`
          *,
          parent:parent_rock_id(*),
          children:eos_rocks!parent_rock_id(*),
          function:accountability_functions(id, name),
          seat:accountability_seats(id, seat_name),
          vto:eos_vto(id, ten_year_target)
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .is('archived_at', null)
        .order('sort_order');
      
      if (error) throw error;
      return buildHierarchy(data);
    },
    enabled: !!profile,
  });
  
  // Get company rocks only
  const companyRocks = rocks?.filter(r => r.rock_level === 'company');
  
  // Get team rocks by function
  const teamRocksByFunction = useMemo(() => {
    if (!rocks) return new Map();
    const map = new Map<string, EosRock[]>();
    rocks.filter(r => r.rock_level === 'team').forEach(rock => {
      const existing = map.get(rock.function_id!) || [];
      map.set(rock.function_id!, [...existing, rock]);
    });
    return map;
  }, [rocks]);
  
  // Get individual rocks by owner
  const individualRocksByOwner = useMemo(() => {
    if (!rocks) return new Map();
    const map = new Map<string, EosRock[]>();
    rocks.filter(r => r.rock_level === 'individual').forEach(rock => {
      const existing = map.get(rock.owner_id!) || [];
      map.set(rock.owner_id!, [...existing, rock]);
    });
    return map;
  }, [rocks]);
  
  return {
    rocks,
    companyRocks,
    teamRocksByFunction,
    individualRocksByOwner,
    isLoading,
    // ... mutations
  };
}
```

---

## Phase 4: UI Redesign

### 4.1 Rocks Page Layout

**New file: `src/pages/EosRocksHierarchy.tsx`**

```text
+------------------------------------------------------------------+
|  Rocks (90-Day Goals)                              [Create Rock] |
|------------------------------------------------------------------|
|  Quarter: [Q1 2025 ▼]    Status: [All ▼]    Search: [_________] |
|------------------------------------------------------------------|
|  [Company] [Team] [Individual]  <-- Tabs                         |
|------------------------------------------------------------------|
|                                                                  |
|  COMPANY TAB:                                                    |
|  +--------------------------+  +--------------------------+      |
|  | ROCK 1: Improve NPS     |  | ROCK 2: Launch Portal   |      |
|  | Owner: Integrator       |  | Owner: Visionary        |      |
|  | Status: On Track ●      |  | Status: At Risk ●       |      |
|  | Children: 3/5 complete  |  | Children: 1/3 complete  |      |
|  | [View Cascade] [Edit]   |  | [View Cascade] [Edit]   |      |
|  +--------------------------+  +--------------------------+      |
|                                                                  |
|  TEAM TAB (grouped by Function):                                 |
|  ┌─ Operations ────────────────────────────────────────────┐     |
|  │ Team Rock: Streamline onboarding → Parent: Improve NPS  │     |
|  │ Owner: Operations Lead    Status: On Track              │     |
|  │ [+ Create Individual Rock]                              │     |
|  └─────────────────────────────────────────────────────────┘     |
|  ┌─ Sales ─────────────────────────────────────────────────┐     |
|  │ No Team Rock for this quarter                           │     |
|  │ [+ Create Team Rock]                                    │     |
|  └─────────────────────────────────────────────────────────┘     |
|                                                                  |
|  INDIVIDUAL TAB:                                                 |
|  Filter: [All Team Members ▼]                                    |
|  +--------------------------+  +--------------------------+      |
|  | My Rock: Complete SOPs  |  | My Rock: Train juniors  |      |
|  | Parent: Streamline...   |  | Parent: Streamline...   |      |
|  | Due: Mar 31             |  | Due: Mar 15             |      |
|  | [●●●○○] 60%             |  | [●●●●●] 100%            |      |
|  +--------------------------+  +--------------------------+      |
+------------------------------------------------------------------+
```

### 4.2 Rock Card Component

**New file: `src/components/eos/rocks/RockCard.tsx`**

Features:
- Display rock title, status badge, owner avatar
- Show child progress (X/Y complete) for Company/Team rocks
- Roll-up status indicator (computed)
- "View Cascade" button to expand children
- Quick status update buttons
- Link to parent rock for Team/Individual

### 4.3 Create Rock Modals

**Company Rock Modal** (`CreateCompanyRockDialog.tsx`):
- Title, description
- Quarter selector (defaults to current)
- VTO link (auto-selects active VTO, shows mission preview)
- Owner Seat dropdown (from Accountability Chart)
- Status defaults to `on_track`

**Team Rock Modal** (`CreateTeamRockDialog.tsx`):
- Parent Company Rock (pre-selected if creating from cascade view)
- Function dropdown (from Accountability Chart functions)
- Validates: only one Team Rock per Function per Company Rock
- Owner auto-fills from function lead

**Individual Rock Modal** (`CreateIndividualRockDialog.tsx`):
- Parent Team Rock (pre-selected)
- Owner dropdown (Vivacity Team users only)
- Status defaults to `on_track`

### 4.4 Cascade View Component

**New file: `src/components/eos/rocks/RockCascadeView.tsx`**

```text
Company Rock: Improve NPS by 20 points
├── Team Rock (Operations): Streamline onboarding process
│   ├── Individual (Angela): Complete SOP documentation
│   ├── Individual (Mike): Train junior consultants
│   └── Individual (Sarah): Implement feedback loop
├── Team Rock (Sales): Increase client touchpoints
│   └── Individual (John): Weekly check-in calls
└── Team Rock (Support): Reduce response time
    └── [+ Add Individual Rock]
```

---

## Phase 5: Status Roll-up Implementation

### 5.1 Client-side Roll-up Calculation

```typescript
// src/utils/rockRollup.ts
export function computeRollupStatus(rock: EosRock, allRocks: EosRock[]): string {
  const children = allRocks.filter(r => r.parent_rock_id === rock.id);
  
  if (children.length === 0) {
    return rock.status || 'on_track';
  }
  
  const hasOffTrack = children.some(c => 
    ['off_track', 'Off_Track', 'at_risk', 'At_Risk'].includes(c.status || '')
  );
  
  if (hasOffTrack) return 'off_track';
  
  const allComplete = children.every(c => 
    ['complete', 'Complete'].includes(c.status || '')
  );
  
  if (allComplete) return 'complete';
  
  return 'on_track';
}

export function getChildStats(rock: EosRock, allRocks: EosRock[]) {
  const children = allRocks.filter(r => r.parent_rock_id === rock.id);
  return {
    total: children.length,
    complete: children.filter(c => c.status?.toLowerCase() === 'complete').length,
    offTrack: children.filter(c => 
      ['off_track', 'at_risk'].includes(c.status?.toLowerCase() || '')
    ).length,
  };
}
```

### 5.2 Server-side Trigger (Optional Enhancement)

```sql
CREATE OR REPLACE FUNCTION update_parent_rock_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update parent roll-up status when child status changes
  IF NEW.parent_rock_id IS NOT NULL THEN
    UPDATE eos_rocks 
    SET updated_at = NOW()
    WHERE id = NEW.parent_rock_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rock_status_rollup
AFTER INSERT OR UPDATE OF status ON eos_rocks
FOR EACH ROW EXECUTE FUNCTION update_parent_rock_status();
```

---

## Phase 6: Meeting Integration Hooks

### 6.1 Level 10 Meeting - Rocks Review Panel

```typescript
// In LiveMeetingView.tsx, add RocksReviewPanel for "Rocks" segment
export function RocksReviewPanel({ meetingId }: { meetingId: string }) {
  const { companyRocks } = useEosRocksHierarchy();
  
  // Default filter: Off Track
  const [statusFilter, setStatusFilter] = useState('off_track');
  
  const filteredRocks = companyRocks?.filter(r => 
    statusFilter === 'all' || r.rollupStatus === statusFilter
  );
  
  return (
    <div>
      <h3>Rocks Review</h3>
      <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      {filteredRocks?.map(rock => (
        <RockReviewCard 
          key={rock.id} 
          rock={rock}
          onStatusUpdate={handleStatusUpdate}
          onCreateTodo={handleCreateLinkedTodo}
        />
      ))}
    </div>
  );
}
```

### 6.2 Quarterly Meeting - Quarter Close Flow (Future)

Hook placeholder for:
- Review all Company/Team/Individual completion
- Archive completed quarter
- Create new quarter Company Rocks
- Cascade prompts for missing Team rocks

---

## Phase 7: Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/useEosRocksHierarchy.tsx` | Main hierarchy hook with CRUD |
| `src/components/eos/rocks/RockCard.tsx` | Rock card component |
| `src/components/eos/rocks/RockCascadeView.tsx` | Cascade tree view |
| `src/components/eos/rocks/CreateCompanyRockDialog.tsx` | Company rock modal |
| `src/components/eos/rocks/CreateTeamRockDialog.tsx` | Team rock modal |
| `src/components/eos/rocks/CreateIndividualRockDialog.tsx` | Individual rock modal |
| `src/components/eos/rocks/RocksReviewPanel.tsx` | Meeting integration |
| `src/utils/rockRollup.ts` | Roll-up calculation utilities |

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/EosRocks.tsx` | Replace with tabbed hierarchy view |
| `src/types/eos.ts` | Add `RockLevel`, update `EosRock` interface |
| `src/components/eos/RockFormDialog.tsx` | Add rock level and parent selection |
| `src/components/eos/LiveMeetingView.tsx` | Integrate RocksReviewPanel |
| `supabase/migrations/` | New migration for schema changes |

---

## Acceptance Criteria

1. Users can create Company Rocks for a quarter, linked to the active VTO
2. Users can create Team Rocks linked to Company Rocks (one per function per quarter)
3. Users can create Individual Rocks linked to Team Rocks
4. Status rolls up correctly: parent = off_track if any child off_track
5. Parent cannot be marked complete unless all children are complete
6. Client tenant users cannot see EOS menu items or access EOS routes (existing)
7. Vivacity Team Users can see all EOS pages and records (existing)
8. Existing Rocks migrate cleanly to Company level
9. Filters work by quarter, owner, level, and status
10. UI matches existing Risks & Opportunities patterns for consistency

---

## Implementation Order

1. **Database migration** (schema + constraints + indexes + migration script)
2. **Type definitions** (update EosRock, add RockLevel)
3. **Core hook** (useEosRocksHierarchy with hierarchy queries)
4. **Rock card component** (reusable card with status, children, actions)
5. **Create dialogs** (Company → Team → Individual modals)
6. **Rocks page redesign** (replace with tabbed view)
7. **Cascade view** (tree visualization)
8. **Roll-up logic** (client-side + optional server trigger)
9. **Meeting integration** (RocksReviewPanel in Level 10)
10. **Testing & validation**

---

## Risk Considerations

| Risk | Mitigation |
|------|------------|
| Existing rocks breaking constraints | Migration sets defaults before enabling constraints |
| Status enum mismatch | Use lowercase consistently, add case-insensitive comparisons |
| Performance with deep hierarchy | Limit to 3 levels (Company → Team → Individual) |
| Orphaned Team/Individual rocks | UI prevents creation without valid parent |
