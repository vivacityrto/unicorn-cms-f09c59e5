
# Plan: Move Package Description to Right of Name

## Overview

Move the `package_full_text` from below the package name to inline beside it, creating a more compact header layout.

---

## Current Layout

```
[Icon] Package Name
       Package Full Text Description
```

## Target Layout

```
[Icon] Package Name — Package Full Text Description
```

---

## Implementation

### File: `src/components/client/ClientPackagesTab.tsx`

**Change:** Replace the stacked `<h3>` and `<p>` with a single inline flex row containing both elements separated by a dash or em-dash.

**Lines 142-147** will change from:

```tsx
<div>
  <h3 className="font-semibold text-lg">{pkg.package_name}</h3>
  {pkg.package_full_text && (
    <p className="text-sm text-muted-foreground">{pkg.package_full_text}</p>
  )}
</div>
```

To:

```tsx
<div className="flex items-baseline gap-2">
  <h3 className="font-semibold text-lg">{pkg.package_name}</h3>
  {pkg.package_full_text && (
    <span className="text-sm text-muted-foreground">— {pkg.package_full_text}</span>
  )}
</div>
```

---

## Visual Result

The package heading will display as:

**KS-RTO** — KickStart for RTOs

With the status badge remaining on the far right as previously positioned.
