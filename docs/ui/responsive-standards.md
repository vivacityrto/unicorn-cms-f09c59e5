# Responsive Breakpoint Standards

This document defines the responsive design system for Unicorn 2.0.

## Breakpoints

Uses Tailwind CSS default breakpoints only:

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| `sm` | 640px | Phones landscape, small tablets |
| `md` | 768px | Tablets portrait |
| `lg` | 1024px | Tablets landscape, small laptops |
| `xl` | 1280px | Laptops, desktops |
| `2xl` | 1536px | Large desktops |

**Rule**: Do not add custom breakpoints unless absolutely required.

## Container Widths

| Purpose | Class | Max Width |
|---------|-------|-----------|
| Page container | `max-w-screen-xl` | 1280px |
| Inner content | `max-w-5xl` | 1024px |
| Forms | `max-w-3xl` | 768px |
| Reading text | `max-w-2xl` | 672px |

**Rule**: Never hard-code pixel widths for primary layout.

## Spacing Scale

Consistent responsive padding across all pages:

```tsx
// Mobile default
className="px-4 py-4"

// Tablet and up
className="md:px-6 md:py-6"

// Desktop and up
className="lg:px-8 lg:py-8"
```

Use the `PageContainer` primitive to apply this automatically.

## Typography Scale

| Element | Mobile | Tablet+ | Line Height |
|---------|--------|---------|-------------|
| Base text | `text-sm` | `md:text-base` | `leading-5 md:leading-6` |
| Section headings | `text-lg` | `md:text-xl` | - |
| Page headings | `text-xl` | `md:text-2xl` | - |

**Rule**: Never use `text-xs` for primary content.

## Grid System

Default responsive grid:

```tsx
// Standard grid gap
className="grid gap-4 md:gap-6"

// Multi-column at md+
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
```

Use the `ResponsiveGrid` primitive:

```tsx
import { ResponsiveGrid } from '@/components/layout';

<ResponsiveGrid cols={{ default: 1, md: 2, lg: 3 }} gap="md">
  <Card />
  <Card />
  <Card />
</ResponsiveGrid>
```

## Modal Sizing

Standard modal shell dimensions:

```tsx
// Width: min(92vw, max-width)
className="w-[min(92vw,40rem)]"

// Height: max 85vh
className="max-h-[85vh]"

// Body scroll
className="overflow-y-auto"

// Responsive padding
className="p-4 md:p-6"
```

Dialog size variants:
- `sm`: 384px
- `md`: 512px (default)
- `lg`: 640px
- `xl`: 768px
- `full`: 1024px

## Input & Button Sizing

| Element | Height | Touch Target |
|---------|--------|--------------|
| Input | `h-10` or `h-11` | 40-44px |
| Button | `h-10` | 40px |
| Small button | `h-9` | 36px |
| Large button | `h-11` | 44px |

**Rule**: Touch targets should be minimum 44x44px on mobile.

## Sidebar Rules

```tsx
// lg and up: persistent sidebar
className="hidden lg:block"

// Below lg: collapse to icon or drawer
className="lg:hidden"

// Main content margin
className="lg:ml-64"
```

## Layout Primitives

### PageContainer

Primary page wrapper with responsive padding:

```tsx
import { PageContainer } from '@/components/layout';

<PageContainer maxWidth="xl">
  <PageHeader title="My Page" />
  <Section>Content</Section>
</PageContainer>
```

### Section

Semantic section with optional header:

```tsx
import { Section } from '@/components/layout';

<Section 
  title="Settings" 
  description="Manage preferences"
  actions={<Button>Save</Button>}
>
  <Form />
</Section>
```

### ResponsiveGrid

Grid with responsive columns:

```tsx
import { ResponsiveGrid } from '@/components/layout';

<ResponsiveGrid 
  cols={{ default: 1, md: 2, lg: 3 }} 
  gap="md"
>
  {items.map(item => <Card key={item.id} />)}
</ResponsiveGrid>
```

### ContentBlock

Constrains content to readable widths:

```tsx
import { ContentBlock } from '@/components/layout';

<ContentBlock variant="form">
  <Form />
</ContentBlock>

<ContentBlock variant="text">
  <Article />
</ContentBlock>
```

### ResponsiveStack

Flexbox that changes direction at breakpoint:

```tsx
import { ResponsiveStack } from '@/components/layout';

<ResponsiveStack 
  direction="col-to-row" 
  breakpoint="sm" 
  spacing="md"
>
  <Input />
  <Button>Submit</Button>
</ResponsiveStack>
```

## Testing Checklist

Test at these widths:
- [ ] 320px (small phones)
- [ ] 375px (iPhone)
- [ ] 640px (sm breakpoint)
- [ ] 768px (md breakpoint)
- [ ] 1024px (lg breakpoint)
- [ ] 1280px (xl breakpoint)

Verify:
- [ ] No horizontal scrollbars
- [ ] Modals usable at 320px
- [ ] Typography readable without zoom
- [ ] Touch targets accessible
- [ ] Long text/names handled gracefully
- [ ] Tables responsive or card fallback
- [ ] Keyboard focus order correct

## Migration Guide

### Before (old pattern)

```tsx
<div className="flex justify-between items-start">
  <div>
    <h1 className="text-3xl font-bold">Title</h1>
    <p className="text-muted-foreground">Description</p>
  </div>
  <Button>Action</Button>
</div>

<div className="grid gap-4 md:grid-cols-4">
  <Card />
</div>
```

### After (new pattern)

```tsx
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveGrid } from '@/components/layout';

<PageHeader 
  title="Title" 
  description="Description"
  actions={<Button>Action</Button>}
/>

<ResponsiveGrid cols={{ default: 2, md: 4 }}>
  <Card />
</ResponsiveGrid>
```

## Resources

- [Tailwind Breakpoints](https://tailwindcss.com/docs/responsive-design)
- [Layout Primitives](../src/components/layout/primitives.tsx)
- [PageHeader Component](../src/components/ui/page-header.tsx)
