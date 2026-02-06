

# Default Sidebar Menu to Collapsed

## Problem

Currently, all sidebar menu sections are expanded by default when the page loads. The user wants all sections to be collapsed by default.

---

## Solution

A single change to the initial state values for `sectionsOpen` in `DashboardLayout.tsx`.

---

## Implementation

### File: `src/components/DashboardLayout.tsx`

**Current code (lines 125-135):**
```tsx
const [sectionsOpen, setSectionsOpen] = useState({
  work: true,
  clients: true,
  eos: true,
  resourceManagement: true,
  administration: true,
  systemConfig: true,
  // Legacy for client view
  main: true,
  team: true,
});
```

**Updated code:**
```tsx
const [sectionsOpen, setSectionsOpen] = useState({
  work: false,
  clients: false,
  eos: false,
  resourceManagement: false,
  administration: false,
  systemConfig: false,
  // Legacy for client view
  main: false,
  team: false,
});
```

---

## Behaviour After Change

| Action | Result |
|--------|--------|
| Page loads | All menu sections are collapsed |
| Click section header | Section expands to show menu items |
| Click section header again | Section collapses |
| Navigate to page within section | Section expands automatically (if active route highlighting is enabled) |

---

## Files Changed

- `src/components/DashboardLayout.tsx` - 8 values changed from `true` to `false`

---

## Technical Note

The collapse/expand state currently resets on page refresh since it's held in React state. If persistent per-user state is desired later, this could be stored in localStorage or user preferences.

