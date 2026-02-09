
## Fix Plan: Switch, Checkbox, and Radio Shape Regressions

### Problem Identified
A global CSS rule in `src/index.css` (lines 329-336) applies `min-height: 2.75rem` (44px) to `button`, `[role="button"]`, `input[type="checkbox"]`, and `input[type="radio"]`:

```css
button, 
[role="button"],
input[type="checkbox"],
input[type="radio"],
select {
  min-height: 2.75rem; /* 44px at base font size */
}
```

Radix UI's Checkbox, Switch, and RadioGroup components use `<button>` elements internally (not native inputs). This global rule forces them to 44px height, distorting:
- **Checkbox**: Stretched into a tall pill instead of a 16x16 square
- **Switch**: Track height forced to 44px, breaking the pill shape
- **Radio**: Distorted into an oval instead of a circle

---

### Solution Overview

**Strategy**: Remove the overly broad global rule and apply touch-target sizing only where appropriate.

---

### Technical Changes

#### 1. Update `src/index.css` - Remove Problematic Global Rule

Replace the current global min-height rule with a more targeted approach:

**Before (lines 329-336):**
```css
button, 
[role="button"],
input[type="checkbox"],
input[type="radio"],
select {
  min-height: 2.75rem; /* 44px at base font size */
}
```

**After:**
```css
/* Touch-target sizing for text inputs and selects only */
input[type="text"],
input[type="email"],
input[type="password"],
input[type="search"],
input[type="tel"],
input[type="url"],
input[type="number"],
input[type="date"],
input[type="time"],
input[type="datetime-local"],
textarea,
select {
  min-height: 2.75rem; /* 44px at base font size */
}

/* Note: Buttons, checkboxes, switches, and radios handle their own sizing.
   Touch targets for these are managed by component-level padding/spacing. */
```

---

#### 2. Update `src/components/ui/switch.tsx` - Restore Standard Dimensions

The Switch component was previously modified. Restore to shadcn/Radix defaults:

**Current (broken):**
```tsx
// Root: h-5 w-9
// Thumb: h-4 w-4, translate-x-4
```

**Fixed:**
```tsx
// Root: h-6 w-11 rounded-full
// Thumb: h-5 w-5 rounded-full, translate-x-5
```

Full component update:
```tsx
<SwitchPrimitives.Root
  className={cn(
    "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
    className,
  )}
  {...props}
  ref={ref}
>
  <SwitchPrimitives.Thumb
    className={cn(
      "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
    )}
  />
</SwitchPrimitives.Root>
```

---

#### 3. Verify `src/components/ui/checkbox.tsx` - Already Correct

Current code is correct (h-4 w-4 rounded-sm):
```tsx
"peer h-4 w-4 shrink-0 rounded-sm border border-primary bg-background ..."
```

No changes needed once the global CSS is fixed.

---

#### 4. Verify `src/components/ui/radio-group.tsx` - Already Correct

Current code is correct (h-4 w-4 rounded-full):
```tsx
"aspect-square h-4 w-4 rounded-full border border-primary ..."
```

No changes needed once the global CSS is fixed.

---

### Files To Modify

| File | Change |
|------|--------|
| `src/index.css` | Replace broad min-height rule with text-input-only targeting |
| `src/components/ui/switch.tsx` | Restore h-6 w-11 track, h-5 w-5 thumb, translate-x-5 |

---

### Expected Results

After these changes:
- **Checkbox**: 16x16px square with rounded-sm corners
- **Switch**: 44x24px pill track with 20x20px circular thumb
- **Radio**: 16x16px perfect circle
- **Text inputs/selects**: Still maintain 44px min-height for touch accessibility

---

### Testing Checklist

1. **Login page** - Verify "Remember me" checkbox is square and aligned
2. **Settings page** - Verify account active switch is pill-shaped with circular thumb
3. **Any radio groups** - Verify radio buttons are circular
4. Toggle states (checked/unchecked) - Verify no resizing occurs
5. Test at 375px, 768px, and 1280px widths
6. Verify no horizontal scrollbar or clipping
