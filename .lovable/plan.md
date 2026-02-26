
## Fix Renewal Date Position

**Problem**: The renewal date is placed as a sibling element next to the actions row (Manage, Finalise, chevron), creating a third column instead of appearing underneath the Finalise button.

**Solution**: Wrap the actions buttons and the renewal date together in a vertical flex column container so the date renders directly below the button row, right-aligned.

### Changes

**File: `src/components/client/ClientPackagesTab.tsx`** (lines 425-483)

1. Wrap the existing actions `div` (line 426-477) and the renewal date block (lines 478-483) inside a new parent `div` with `flex flex-col items-end` classes
2. This creates a vertical stack where:
   - The buttons row appears on top
   - The renewal date appears directly underneath, right-aligned
3. No other files need changes

### Structure (before vs after)

**Before:**
```text
[Left content] --- [Actions div] --- [Renewal date]
```

**After:**
```text
[Left content] --- [ Actions div      ]
                    [ Renewal date     ]
```
