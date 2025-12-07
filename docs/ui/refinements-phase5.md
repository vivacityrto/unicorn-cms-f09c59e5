# UI Refinements - Phase 5+

## Overview
This document describes the enhanced design system and UI components implemented in Phase 5+ for consistent, accessible, and polished interfaces across Dashboard and EOS modules.

## Design Tokens

### Color System
All colors use HSL format for consistency and dark mode support:

```css
/* Primary colors */
--primary: 275 54% 41%;        /* Vivacity purple */
--secondary: 196 100% 47%;     /* Vivacity aqua */

/* Status colors */
--success: 142 76% 36%;
--warning: 38 92% 50%;
--destructive: 0 84.2% 60.2%;
--info: 217 91% 60%;

/* Neutral colors */
--muted: 240 10% 96%;
--border: 240 10% 90%;
```

### Spacing Scale
Extended spacing scale for consistent layouts:
- `space-18`: 4.5rem (72px)
- `space-88`: 22rem (352px)
- `space-128`: 32rem (512px)

### Shadows
Elevation system for depth hierarchy:
- `shadow-sm`: Subtle elevation
- `shadow-md`: Default cards
- `shadow-lg`: Modals/popovers
- `shadow-card`: Card default
- `shadow-card-hover`: Card hover state

### Border Radius
- `rounded-lg`: 1rem (default)
- `rounded-md`: calc(1rem - 2px)
- `rounded-sm`: calc(1rem - 4px)

### Animations
Respects `prefers-reduced-motion`:
- `fade-in`: 200ms ease-out
- `slide-in-right`: 300ms ease-out
- Duration tokens: `--duration-fast` (150ms), `--duration-normal` (200ms), `--duration-slow` (300ms)

## Shared Components

### PageHeader
Main page title with optional description, icon, and actions.

```tsx
import { PageHeader } from '@/components/ui/page-header';
import { Plus, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

<PageHeader
  title="Rocks (90-Day Goals)"
  description="Track quarterly objectives and key results"
  icon={Rocket}
  actions={
    <Button>
      <Plus className="mr-2 h-4 w-4" />
      Add Rock
    </Button>
  }
/>
```

### StatCard
Display key metrics with optional trends and icons.

```tsx
import { StatCard } from '@/components/ui/stat-card';
import { Users } from 'lucide-react';

<StatCard
  label="Total Users"
  value={1234}
  icon={Users}
  intent="success"
  trend={{ value: 12, positive: true }}
  onClick={() => console.log('Clicked')}
/>
```

**Props:**
- `intent`: 'default' | 'success' | 'warning' | 'danger' | 'info'
- `onClick`: Makes card clickable with hover effects

### AnimatedTabs
Smooth tab transitions with motion support.

```tsx
import { AnimatedTabs } from '@/components/ui/animated-tabs';
import { FileText, Users } from 'lucide-react';

<AnimatedTabs
  value={activeTab}
  onValueChange={setActiveTab}
  tabs={[
    {
      value: 'details',
      label: 'Details',
      icon: <FileText className="h-4 w-4" />,
      content: <DetailsPanel />
    },
    {
      value: 'team',
      label: 'Team',
      icon: <Users className="h-4 w-4" />,
      content: <TeamPanel />
    }
  ]}
/>
```

**Features:**
- Respects `prefers-reduced-motion`
- 200ms fade + slide animation
- Icon support per tab

### EmptyState
Friendly empty states with optional CTA.

```tsx
import { EmptyState } from '@/components/ui/empty-state';
import { Inbox, Plus } from 'lucide-react';

<EmptyState
  icon={Inbox}
  title="No issues yet"
  description="Start by identifying organizational issues to discuss and solve"
  action={{
    label: 'Create Issue',
    onClick: handleCreate,
    icon: Plus
  }}
/>
```

### Loading Skeletons
Pre-built skeletons for common patterns:

```tsx
import { 
  TableSkeleton, 
  CardSkeleton, 
  StatCardSkeleton,
  PageHeaderSkeleton 
} from '@/components/ui/loading-skeleton';

{isLoading ? <TableSkeleton rows={5} /> : <DataTable />}
```

### DataTableEmpty
Empty state for tables with header preserved:

```tsx
import { DataTableEmpty } from '@/components/ui/data-table-empty';
import { FileQuestion, Plus } from 'lucide-react';

<DataTableEmpty
  columns={['Name', 'Status', 'Date', 'Actions']}
  icon={FileQuestion}
  title="No records found"
  description="Create your first record to get started"
  action={{
    label: 'Add Record',
    onClick: handleAdd,
    icon: Plus
  }}
/>
```

## Layout Guidelines

### Page Structure
```tsx
<div className="space-y-6">
  <PageHeader {...headerProps} />
  
  {/* Stats row */}
  <div className="grid gap-4 md:grid-cols-4">
    <StatCard {...statProps} />
  </div>
  
  {/* Main content */}
  <AnimatedTabs {...tabsProps} />
</div>
```

### Consistent Spacing
- Outer page padding: `p-6`
- Card padding: `p-5` or `p-6`
- Section gaps: `gap-6`
- Component spacing: `space-y-4` or `space-y-6`

### Card Usage
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

<Card className="shadow-card hover:shadow-card-hover transition-shadow">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

## Accessibility

### Focus Rings
All interactive elements have visible focus rings:
```tsx
className="focus:ring-2 focus:ring-ring focus:ring-offset-2"
```

### ARIA Labels
```tsx
<button aria-label="Close dialog">
  <X className="h-4 w-4" />
</button>

<div role="tabpanel" aria-labelledby="tab-overview">
  {/* Content */}
</div>
```

### Keyboard Navigation
- Tab order follows visual flow
- Enter/Space activates buttons
- Escape closes dialogs
- Arrow keys navigate tabs

### Screen Readers
```tsx
<span className="sr-only">Loading...</span>
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>
```

## Performance

### Code Splitting
```tsx
import { lazy, Suspense } from 'react';

const HeavyChart = lazy(() => import('./HeavyChart'));

<Suspense fallback={<CardSkeleton />}>
  <HeavyChart data={data} />
</Suspense>
```

### Memoization
```tsx
import { memo, useMemo } from 'react';

const ExpensiveList = memo(({ items }) => {
  return items.map(item => <Item key={item.id} {...item} />);
});

const filteredData = useMemo(
  () => data.filter(item => item.active),
  [data]
);
```

### Reduced Motion
Always check for motion preference:
```tsx
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const variants = prefersReducedMotion ? {} : {
  initial: { opacity: 0 },
  animate: { opacity: 1 }
};
```

## Migration Guide

### Updating Existing Pages

1. **Replace page headers:**
```tsx
// Before
<div className="flex justify-between items-start">
  <div>
    <h1 className="text-3xl font-bold">Title</h1>
    <p className="text-muted-foreground">Description</p>
  </div>
  <Button>Action</Button>
</div>

// After
<PageHeader
  title="Title"
  description="Description"
  actions={<Button>Action</Button>}
/>
```

2. **Replace stat cards:**
```tsx
// Before
<Card>
  <CardContent className="p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">Label</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <Icon className="h-8 w-8" />
    </div>
  </CardContent>
</Card>

// After
<StatCard label="Label" value={value} icon={Icon} />
```

3. **Add loading states:**
```tsx
// Before
{data?.map(item => <Item key={item.id} {...item} />)}

// After
{isLoading ? (
  <TableSkeleton rows={5} />
) : data?.length ? (
  data.map(item => <Item key={item.id} {...item} />)
) : (
  <EmptyState {...emptyProps} />
)}
```

4. **Upgrade tabs:**
```tsx
// Before
<Tabs value={tab} onValueChange={setTab}>
  <TabsList>
    <TabsTrigger value="a">A</TabsTrigger>
    <TabsTrigger value="b">B</TabsTrigger>
  </TabsList>
  <TabsContent value="a">{/* Content */}</TabsContent>
  <TabsContent value="b">{/* Content */}</TabsContent>
</Tabs>

// After
<AnimatedTabs
  value={tab}
  onValueChange={setTab}
  tabs={[
    { value: 'a', label: 'A', content: <ContentA /> },
    { value: 'b', label: 'B', content: <ContentB /> }
  ]}
/>
```

## Testing Checklist

- [ ] Focus rings visible on all interactive elements
- [ ] Keyboard navigation works (Tab, Enter, Escape, Arrows)
- [ ] Screen reader announces state changes
- [ ] Reduced motion respected
- [ ] Loading states show skeletons
- [ ] Empty states show helpful CTAs
- [ ] Cards have consistent padding/shadows
- [ ] Colors use semantic tokens (no hardcoded hex)
- [ ] Animations smooth (200-300ms)
- [ ] No layout shift on tab/content changes
- [ ] Mobile responsive
- [ ] Dark mode tokens ready (even if not enabled)

## Resources

- [Tailwind Config](../../tailwind.config.ts)
- [Design Tokens](../../src/index.css)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
