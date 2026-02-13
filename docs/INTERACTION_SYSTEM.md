# Unicorn 2.0 – Interaction & Engagement System Reference

## 1. Micro-Interactions – Motion Timing

| Interaction | Duration | Easing | Notes |
|-------------|----------|--------|-------|
| Hover transitions | 200ms | `ease-smooth` | All interactive elements |
| State transitions | 200–250ms | `ease-smooth` | Tabs, toggles, selections |
| Button active press | instant | – | `scale(0.98)` on `:active` |
| Page transitions | 300ms | `ease-out` | Fade + slide |
| Progress fill | 500ms | `ease-smooth` | Animated bar fill |

**Rules:**
- No bounce or playful motion
- All motion disabled when `prefers-reduced-motion: reduce`
- User setting: "Reduce motion effects" stored in localStorage

---

## 2. Button Behaviour

### States

| State | Visual | Implementation |
|-------|--------|----------------|
| Default | Brand variant colour | `buttonVariants` |
| Hover | Darker shade | `hover:bg-primary/85` |
| Active | Scale 0.98 | `active:scale-[0.98]` |
| Loading | Spinner + text | `isLoading` prop |
| Success | Check icon + text | `showSuccess` prop |
| Disabled | 50% opacity | `disabled:opacity-50` |

### Usage

```tsx
<Button isLoading={saving}>Save Client</Button>
<Button showSuccess={saved}>Saved</Button>
```

### Apply to:
- Phase progression
- Generate document
- Sync TGA
- Save client
- Log hours

---

## 3. Celebration System

### Import

```tsx
import { useCelebration } from '@/hooks/use-celebration';

const { celebrate } = useCelebration();
```

### Tiers

#### Tier 1 – Subtle Spark (1.5s)
Small corner fireworks burst. Non-blocking.

```tsx
celebrate({
  tier: 'spark',
  message: 'Phase Section Complete.',
});
```

**Triggers:** Rock completed, section completed, task milestone.

#### Tier 2 – Major Milestone (2s)
Overlay with subtle fireworks, Acai 40% backdrop. Auto-dismiss.

```tsx
celebrate({
  tier: 'milestone',
  message: 'Compliance Phase Complete.',
  ctaLabel: 'View Summary',
  ctaAction: () => navigate('/summary'),
});
```

**Triggers:** Compliance phase complete, package complete, audit success, document suite generated.

#### Tier 3 – Enterprise Win (3s)
Full-screen celebration with brand-only fireworks.

```tsx
celebrate({
  tier: 'enterprise',
  message: 'Client Lifecycle Complete.',
  subtitle: 'All compliance phases delivered successfully.',
  ctaLabel: 'Download Completion Report',
  ctaAction: downloadReport,
});
```

**Triggers:** Full client lifecycle completion, major accreditation success.

### Design Constraints
- Brand colours ONLY: Purple, Fuchsia, Aqua, Macaron
- No rainbow, no cartoon style, no looping animation
- Must not block workflow (auto-dismiss)
- Disabled for `prefers-reduced-motion`
- User setting: `reducedCelebration` toggle

### DO NOT trigger for:
- Simple saves
- Navigation
- Form validation success
- Minor edits

---

## 4. Progress Indicators

### Progress Bar

```tsx
import { Progress } from '@/components/ui/progress';

<Progress value={75} label="Phase Progress" showValue />
```

- Animated fill with smooth 500ms transition
- Shows percentage and label
- Used for: compliance phases, package completion, EOS Rocks, health checks

### Phase Steps

```tsx
import { PhaseSteps } from '@/components/ui/phase-steps';

<PhaseSteps steps={[
  { id: '1', label: 'Scope', status: 'completed' },
  { id: '2', label: 'Documents', status: 'current' },
  { id: '3', label: 'Review', status: 'locked' },
  { id: '4', label: 'Audit', status: 'risk', riskLevel: 'warning' },
]} />
```

**Step statuses:**
- `completed` – Purple with check
- `current` – Purple ring highlight
- `pending` – Muted
- `locked` – Muted with lock icon
- `risk` – Macaron (warning) or Fuchsia (critical)

---

## 5. Achievement Badges

```tsx
import { AchievementBadge } from '@/components/ui/achievement-badge';

<AchievementBadge label="Audit Ready" variant="compliant" />
<AchievementBadge label="Zero Risk Flags" variant="success" />
<AchievementBadge label="100% Generated" variant="milestone" />
<AchievementBadge label="All Tasks Cleared" variant="excellence" />
```

Display on dashboard and client portal. Minimal styling.

---

## 6. Error Handling

### ErrorDisplay Component

```tsx
import { ErrorDisplay } from '@/components/ui/error-display';

<ErrorDisplay
  variant="error"
  title="Action could not be completed."
  reason="The TGA sync failed due to a network timeout."
  suggestion="Check your connection and try again."
  technicalDetail="Error: ETIMEDOUT at fetch()"
/>
```

### Colour Mapping

| Level | Colour | Token |
|-------|--------|-------|
| Error | Fuchsia | `variant="error"` |
| Warning | Macaron | `variant="warning"` |
| Info | Aqua | `variant="info"` |

### Rules
- Never fail silently
- Always include: clear reason + suggested fix
- Technical detail expandable (hidden by default)

---

## 7. Alert Component

Updated with brand semantic variants:

```tsx
<Alert variant="destructive">...</Alert>  // Fuchsia
<Alert variant="warning">...</Alert>      // Macaron
<Alert variant="info">...</Alert>         // Aqua
```

---

## 8. Confirmation Modals

### Standard

```tsx
<ConfirmDialog
  variant="destructive"
  title="Delete Client"
  description="This action cannot be undone."
  itemName="Acme Training RTO"
  confirmText="Delete"
  onConfirm={handleDelete}
/>
```

### High-Risk (Typed Confirmation)

```tsx
<ConfirmDialog
  variant="destructive"
  title="Reset Integration"
  description="This will remove all synced data."
  requireTypedConfirmation="RESET"
  confirmText="Reset Integration"
  onConfirm={handleReset}
/>
```

---

## 9. Loading States

### Skeleton Loaders (existing)
`TableSkeleton`, `CardSkeleton`, `FormSkeleton`, `DetailPageSkeleton`

### Button-Level Loading
```tsx
<Button isLoading>Generating...</Button>
```

### Section Loading
Use `Skeleton` component for section-level placeholders.

### Colour
Aqua-tinted loading indicators via `bg-muted` (inherits from design system).

---

## 10. Focus & Accessibility

- Visible focus ring: `ring-ring` (Purple)
- Minimum 2px outline offset
- Logical keyboard navigation (tab order)
- All interactive elements: `focus-visible:ring-2`
- Touch targets: minimum 44px

---

## 11. Data Table Interactions

| Feature | Implementation |
|---------|---------------|
| Row hover | `hover:bg-brand-light-purple-100` |
| Sticky headers | `sticky top-0 z-10 bg-brand-acai-50` |
| Column sorting | Smooth transition on sort icon |
| Loading | `DataGridSkeleton` component |
| Empty state | `EmptyState` component |
| Inline actions | Ghost buttons in last column |

---

## 12. Time Tracker Enhancements

| Event | Behaviour |
|-------|-----------|
| Expand/collapse | 200ms smooth transition |
| Total update | Instant recalculation |
| Nearing limit | Macaron warning badge |
| Breach risk | Fuchsia alert |
| Milestone | Spark celebration: "100 Consult Hours Logged" |

---

## 13. Client Portal Engagement

- Tier 1 and Tier 2 celebrations only (no full-screen)
- Professional, encouraging tone
- Contextual help panels
- Progress visibility on dashboard
