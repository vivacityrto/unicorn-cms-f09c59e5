
## Data Flow Analysis: "Active" Status Origin

### Current Implementation (Lines 183-189 in ClientPackagesTab.tsx)

The "active" badge displayed at line 183-189 is derived from the `membership_state` field in the `ClientPackage` interface:

```typescript
<Badge 
  variant="outline"
  className={`${STATE_COLORS[pkg.membership_state] || ''}`}
>
  {STATE_ICONS[pkg.membership_state]}
  <span className="ml-1 capitalize">{pkg.membership_state}</span>
</Badge>
```

### Data Source Trace

**1. useClientPackages Hook** (`src/hooks/useClientManagement.tsx`, lines 535-624)
   - Fetches from `package_instances` table
   - **Key line 591**: `membership_state: inst.is_complete ? 'exiting' : 'active'`
   - **This is where "active" is computed** – it's a derived value, not stored in the database

**2. Logic**
   - `package_instances.is_complete = false` → `membership_state = 'active'`
   - `package_instances.is_complete = true` → `membership_state = 'exiting'`

**3. State Color Mapping** (`ClientPackagesTab.tsx`, lines 43-48)
   ```typescript
   const STATE_COLORS: Record<string, string> = {
     active: 'bg-green-500/10 text-green-600 border-green-500',
     at_risk: 'bg-amber-500/10 text-amber-600 border-amber-500',
     paused: 'bg-gray-500/10 text-gray-600 border-gray-500',
     exiting: 'bg-red-500/10 text-red-600 border-red-500'
   };
   ```

### Current Data Structure Issue

The `ClientPackage` interface (lines 5-19) includes:
```typescript
membership_state: string;
```

But this field:
- Is **not** stored in the `package_instances` table
- Is **computed frontend-side** based on `is_complete` boolean
- Only supports two hardcoded states: `active` or `exiting`
- Cannot represent `at_risk` or `paused` states mentioned in the color mapping

### Why This Matters

The system references four possible states (`active`, `at_risk`, `paused`, `exiting`) in the UI, but only two can be represented with the current logic. To support the full state machine:

1. **Option A (Recommended)**: Add a `membership_state` column to `package_instances` table with enum values: `active`, `at_risk`, `paused`, `exiting`, `complete`
   - Enables true state persistence
   - Required for audit compliance
   - Supports future state transitions (pause, escalate to at_risk)

2. **Option B**: Maintain computed logic but expand the rules to check multiple factors (overdue tasks, hours usage, inactivity) to determine `at_risk` and `paused` states
   - More complex frontend logic
   - No audit trail of state transitions

### Recommendation

Implement **Option A** via a database migration:
- Add `membership_state` column (default to 'active')
- Create a database function to transition states (audit logged)
- Update the hook to read from the column instead of computing from `is_complete`
- This aligns with Unicorn 2.0's audit-first principle

