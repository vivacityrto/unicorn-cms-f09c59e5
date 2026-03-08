

## Plan: Auto-expand packages on Packages tab load

### Problem
When clicking the Packages tab, all package cards start collapsed. The user wants them expanded by default (showing stages).

### Change

**File: `src/components/client/ClientPackagesTab.tsx`**

Add a `useEffect` that auto-expands all displayed (active) packages on initial load. When `packages` data first arrives and `expandedPackages` is still empty (no deep-link override), populate it with all active package IDs.

```typescript
// After the existing auto-expand deep-link useEffect (~line 127)
useEffect(() => {
  if (packages.length > 0 && expandedPackages.size === 0 && !autoExpandPackageInstanceId) {
    const activeIds = new Set(activePackages.map(p => p.package_id));
    setExpandedPackages(activeIds);
  }
}, [packages]);
```

This ensures:
- First load: all active packages are expanded, showing their stages
- Deep-link navigation: only the targeted package expands (existing behaviour preserved)
- User can still manually collapse/expand individual packages
- History view packages remain collapsed until toggled

