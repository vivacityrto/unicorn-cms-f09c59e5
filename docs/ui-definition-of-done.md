# UI Definition of Done

Every UI change must pass this checklist before merge. This ensures responsive layouts, accessible modals, and consistent user experience across all screen sizes.

## Quick Links

- **QA Harness**: `/admin/qa/responsive` — Use this to test layouts at all breakpoints
- **Responsive Standards**: `docs/ui/responsive-standards.md`
- **Modal/Drawer System**: `docs/ui/modal-drawer-system.md`
- **Responsive Tables**: `docs/ui/responsive-tables.md`

---

## ✅ Checklist

### 1. Responsive Layout

| Check | Description |
|-------|-------------|
| ☐ | Tested at **320px** width (smallest mobile) |
| ☐ | Tested at **375px** width (iPhone SE/mini) |
| ☐ | Tested at **640px** width (sm breakpoint) |
| ☐ | Tested at **768px** width (md breakpoint / tablet) |
| ☐ | Tested at **1024px** width (lg breakpoint / laptop) |
| ☐ | Tested at **1280px** width (xl breakpoint / desktop) |
| ☐ | **No page-level horizontal scroll** at any breakpoint |
| ☐ | Modals fit within viewport with body scroll |
| ☐ | Buttons and inputs remain usable on touch devices (min 44px targets) |

**How to test:**
1. Open `/admin/qa/responsive` (SuperAdmin/VivacityTeam only)
2. Click each breakpoint preset
3. Verify no horizontal scrollbar appears on the page
4. If overflow warning banner appears, fix before proceeding

---

### 2. Typography

| Check | Description |
|-------|-------------|
| ☐ | Base text uses `text-sm` minimum for readability |
| ☐ | Headings scale by breakpoint (`text-xl md:text-2xl` for page titles) |
| ☐ | No clipped labels on form inputs |
| ☐ | No truncated critical fields without tooltip or expansion |
| ☐ | Long text uses `break-words` or proper wrapping |

**Typography scale:**
- Base text: `text-sm md:text-base`
- Section headings: `text-lg md:text-xl`
- Page headings: `text-xl md:text-2xl`

---

### 3. Layout Components

| Check | Description |
|-------|-------------|
| ☐ | No fixed pixel widths for main containers (use `max-w-screen-xl`, `max-w-5xl`, etc.) |
| ☐ | Tables use `ResponsiveTableShell` component |
| ☐ | Admin tables have mobile card fallback using `ResponsiveListCards` |
| ☐ | Filters stack vertically on mobile (`flex-col md:flex-row`) |
| ☐ | Footer buttons stack on mobile (`flex-col-reverse sm:flex-row`) |

**Required components:**
```tsx
import { ResponsiveTableShell, ResponsiveListCards, ResponsiveListCard } from "@/components/ui/responsive-table";
import { PageContainer, Section, ResponsiveGrid } from "@/components/layout";
```

---

### 4. Modals & Drawers

| Check | Description |
|-------|-------------|
| ☐ | Uses unified modal system (`AppModal`, `FormModal`, `ConfirmDialog`, `AppDrawer`) |
| ☐ | Focus is trapped inside modal |
| ☐ | Focus returns to trigger element on close |
| ☐ | ESC key closes modal (unless `isBlocking=true`) |
| ☐ | Backdrop click closes modal (unless `isBlocking=true`) |
| ☐ | Close button visible in top-right |
| ☐ | Header and footer are sticky, body scrolls |
| ☐ | Width is viewport-safe: `w-[min(92vw, maxWidth)]` |
| ☐ | Height is viewport-safe: `max-h-[85vh]` |

**Required imports:**
```tsx
import {
  AppModal,
  AppModalContent,
  FormModal,
  ConfirmDialog,
  AppDrawer,
} from "@/components/ui/modals";
```

---

### 5. Accessibility

| Check | Description |
|-------|-------------|
| ☐ | All form inputs have associated labels |
| ☐ | Interactive elements have visible focus states |
| ☐ | Colour contrast meets WCAG AA (4.5:1 for text) |
| ☐ | Icons have `aria-label` or accompanying text |
| ☐ | Tables have proper `<thead>` and semantic structure |
| ☐ | Tab order is logical (close → primary action → secondary) |

---

### 6. Data Edge Cases

| Check | Description |
|-------|-------------|
| ☐ | Long names (50+ chars) don't break layout |
| ☐ | Long emails don't cause horizontal scroll |
| ☐ | Long tenant/org names wrap properly |
| ☐ | Long statuses wrap or truncate gracefully |
| ☐ | Empty states render cleanly with helpful message |
| ☐ | Loading states use consistent skeletons (no layout jump) |
| ☐ | Error states show clear message and retry option |

**Test data patterns:**
- Long name: `Dr. Alexandria Bartholomew-Smithington III`
- Long email: `very.long.email.address.for.testing@subdomain.example-domain.com.au`
- Long tenant: `Australian Vocational Education and Training Institute of Excellence Pty Ltd`

---

## 🧪 Testing Workflow

1. **Open QA Harness**: Navigate to `/admin/qa/responsive`
2. **Test each breakpoint**: Click 320 → 375 → 640 → 768 → 1024 → 1280 → Full
3. **Check for overflow**: Watch for red warning banner
4. **Test modals**: Click each modal launcher button
5. **Verify focus trap**: Tab through modal, confirm focus stays inside
6. **Test ESC close**: Press Escape, confirm modal closes
7. **Test with worst-case data**: Use the torture block to verify text handling

---

## 🚫 Common Mistakes to Avoid

| Don't | Do |
|-------|-----|
| `width: 500px` | `max-w-lg` or `w-full max-w-[500px]` |
| `overflow-hidden` on body | `overflow-x-auto` on table container |
| Custom modal wrapper | Use `AppModal` or `FormModal` |
| `truncate` without tooltip | `truncate` + `<Tooltip>` or `break-words` |
| Fixed height modals | `max-h-[85vh]` with scrollable body |
| Hiding columns completely | `columnVisibility.lg` with mobile card fallback |

---

## 📋 Sign-off

Before requesting review:

- [ ] I have tested at all breakpoints
- [ ] I have verified no horizontal scroll exists
- [ ] I have tested all modals/drawers on mobile width
- [ ] I have tested with long/edge-case data
- [ ] I have run the QA Harness checks

---

## Related Documentation

- [Responsive Standards](./ui/responsive-standards.md)
- [Modal & Drawer System](./ui/modal-drawer-system.md)
- [Responsive Tables](./ui/responsive-tables.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
