# Responsive Table System

This document describes the standardized components for making tables readable on all screen sizes.

## Core Principles

1. **No page-level horizontal scroll** - Tables scroll internally only
2. **Mobile card fallback** - Dense tables become cards on mobile
3. **Column priority** - Hide low-priority columns on smaller screens
4. **Touch-friendly** - Actions in dropdown menus on mobile

## Components

### ResponsiveTableShell

Wrapper that contains horizontal scroll within the table region.

```tsx
import { ResponsiveTableShell } from "@/components/ui/responsive-table";

<ResponsiveTableShell>
  <Table>
    {/* Table content */}
  </Table>
</ResponsiveTableShell>
```

**Props:**
- `stickyHeader`: Enable sticky thead (boolean)
- `minWidth`: Minimum width before scrolling (string)

### ResponsiveListCard

Card for mobile list view.

```tsx
import { ResponsiveListCard } from "@/components/ui/responsive-table";

<ResponsiveListCard
  title="John Doe"
  subtitle="john@example.com"
  status={<Badge>Active</Badge>}
  onClick={() => navigate(`/user/${id}`)}
  fields={[
    { label: 'Role', value: 'Admin', priority: 'primary' },
    { label: 'Phone', value: '+61 400 000 000', priority: 'secondary' },
  ]}
  actions={[
    { label: 'Edit', icon: <Edit />, onClick: handleEdit },
    { label: 'Delete', icon: <Trash2 />, onClick: handleDelete, variant: 'destructive' },
  ]}
/>
```

**Field Priorities:**
- `primary`: Always visible
- `secondary`: Shown in expandable section
- `tertiary`: Shown in expandable section

### ResponsiveListCards

Container for card-based list view.

```tsx
<ResponsiveListCards isEmpty={items.length === 0} emptyState="No items found">
  {items.map(item => (
    <ResponsiveListCard key={item.id} ... />
  ))}
</ResponsiveListCards>
```

### ResponsiveTableView

Automatically switches between table and cards based on screen size.

```tsx
import { ResponsiveTableView } from "@/components/ui/responsive-table";

<ResponsiveTableView
  items={users}
  keyExtractor={(u) => u.id}
  renderTable={() => <UsersTable users={users} />}
  renderCard={(user) => <UserCard user={user} />}
  emptyState="No users found"
/>
```

## Column Visibility

Use these classes on TableHead and TableCell to hide columns at breakpoints.

```tsx
import { columnVisibility } from "@/components/ui/responsive-table";

// Always visible
<TableHead>Name</TableHead>
<TableCell>{name}</TableCell>

// Hidden below lg (1024px)
<TableHead className={columnVisibility.lg}>Email</TableHead>
<TableCell className={columnVisibility.lg}>{email}</TableCell>

// Hidden below xl (1280px)
<TableHead className={columnVisibility.xl}>Phone</TableHead>
<TableCell className={columnVisibility.xl}>{phone}</TableCell>
```

**Available classes:**
- `columnVisibility.always` - Always visible
- `columnVisibility.sm` - Hidden below 640px
- `columnVisibility.md` - Hidden below 768px
- `columnVisibility.lg` - Hidden below 1024px
- `columnVisibility.xl` - Hidden below 1280px

## Pattern: Table with Mobile Cards

```tsx
// Mobile card view (visible on < md)
<div className="md:hidden">
  <ResponsiveListCards>
    {items.map(item => (
      <ResponsiveListCard
        key={item.id}
        title={item.name}
        subtitle={item.email}
        status={<StatusBadge status={item.status} />}
        fields={[
          { label: 'Role', value: item.role },
          { label: 'Phone', value: item.phone, priority: 'secondary' },
        ]}
        actions={[
          { label: 'Edit', onClick: () => handleEdit(item.id) },
          { label: 'Delete', onClick: () => handleDelete(item.id), variant: 'destructive' },
        ]}
      />
    ))}
  </ResponsiveListCards>
</div>

// Desktop table view (visible on md+)
<ResponsiveTableShell className="hidden md:block">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead className={columnVisibility.lg}>Email</TableHead>
        <TableHead>Role</TableHead>
        <TableHead className={columnVisibility.xl}>Phone</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(item => (
        <TableRow key={item.id}>
          <TableCell>{item.name}</TableCell>
          <TableCell className={columnVisibility.lg}>{item.email}</TableCell>
          <TableCell>{item.role}</TableCell>
          <TableCell className={columnVisibility.xl}>{item.phone}</TableCell>
          <TableCell><StatusBadge status={item.status} /></TableCell>
          <TableCell>
            <ActionButtons item={item} />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</ResponsiveTableShell>
```

## Column Priority Guidelines

| Priority | Visibility | Example Fields |
|----------|------------|----------------|
| Always visible | All breakpoints | Name, Status, Primary action |
| `columnVisibility.lg` | 1024px+ | Email, Secondary identifier |
| `columnVisibility.xl` | 1280px+ | Phone, Tenant, Created date |

## Text Overflow

Use these patterns to handle long text:

```tsx
// Truncate with ellipsis
<TableCell className="max-w-[200px] truncate">{longText}</TableCell>

// Break words (for emails, URLs)
<TableCell className="break-all">{email}</TableCell>

// Multi-line with limit
<TableCell className="max-w-[300px]">
  <div className="line-clamp-2">{description}</div>
</TableCell>
```

## Actions on Mobile

Always consolidate row actions into a dropdown menu:

```tsx
import { MobileActionMenu } from "@/components/ui/responsive-table";

// In card view
<ResponsiveListCard
  actions={[
    { label: 'Edit', icon: <Edit />, onClick: handleEdit },
    { label: 'Delete', icon: <Trash2 />, onClick: handleDelete, variant: 'destructive' },
  ]}
/>

// Or standalone
<MobileActionMenu
  actions={[
    { label: 'Edit', icon: <Edit />, onClick: handleEdit },
    { label: 'Delete', icon: <Trash2 />, onClick: handleDelete, variant: 'destructive' },
  ]}
/>
```

## Testing Checklist

- [ ] No page-level horizontal scroll at 320px
- [ ] No page-level horizontal scroll at 375px
- [ ] Cards display correctly on mobile
- [ ] Table displays correctly on md+
- [ ] Column visibility works at each breakpoint
- [ ] Long text doesn't break layout
- [ ] Actions are accessible on mobile
- [ ] Expandable sections work in cards
- [ ] Touch targets are at least 44px
