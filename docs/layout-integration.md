# Layout Integration - Unicorn 2.0

## Overview
All pages in Unicorn 2.0 use a consistent layout structure with Sidebar, Topbar, and Footer components.

## Layout Components

### 1. DashboardLayout (AppLayout)
- **Location**: `src/components/DashboardLayout.tsx`
- **Alias**: `src/components/layout/AppLayout.tsx` (for consistency)
- **Usage**: Wrap all main application pages

### 2. Sidebar
- **Location**: Built into DashboardLayout
- **Features**:
  - Collapsible/expandable navigation
  - Role-based menu items (Super Admin, Admin, User)
  - Active route highlighting
  - Grouped sections (Main, Administration, EOS/Level 10, Advanced Features)

### 3. Topbar (Header)
- **Location**: Built into DashboardLayout
- **Features**:
  - User avatar and info
  - Notification dropdown
  - Sign out button
  - Sticky positioning on scroll

### 4. Footer
- **Location**: `src/components/layout/Footer.tsx`
- **Content**:
  - Copyright notice
  - Vivacity website link: [vivacity.com.au](https://vivacity.com.au)
  - Support email: support@vivacity.com.au
  - Phone: 1300 729 455

## EOS Module Navigation

The sidebar includes these EOS sections (visible to Super Admin):

- **EOS Overview** (`/eos`)
- **Scorecard** (`/eos/scorecard`) - Track weekly metrics with 13-period view
- **V/TO** (`/eos/vto`) - Vision/Traction Organizer with versioning
- **Rocks** (`/eos/rocks`) - 90-day goals with client tagging
- **Issues** (`/eos/issues`) - Issue tracking and resolution
- **To-Dos** (`/eos/todos`) - Task management
- **Meetings** (`/eos/meetings`) - Level 10 meeting scheduler

## Page Implementation Pattern

### Standard Page Structure
```tsx
import { DashboardLayout } from '@/components/DashboardLayout';

export default function YourPage() {
  return (
    <DashboardLayout>
      <PageContent />
    </DashboardLayout>
  );
}

function PageContent() {
  // Your page logic and rendering here
  return (
    <div className="space-y-6">
      {/* Page content */}
    </div>
  );
}
```

### Fullscreen Pages (No Layout)
Some pages like `LiveMeetingView` don't use the standard layout for immersive experiences:
- `/eos/meetings/:meetingId/live` - Live meeting interface

## Responsive Behavior

### Desktop
- Sidebar: 256px width (expanded), 80px width (collapsed)
- Content area: Adjusts based on sidebar state
- Footer: Full width at bottom

### Tablet/Mobile
- Sidebar: Collapsible overlay
- Topbar: Sticky at top
- Footer: Full width, center-aligned

## Styling Guidelines

### Colors
- Sidebar background: Gradient from `#6109A1` to `#D51C49`
- Topbar: Card background with border
- Footer: Card background with top border
- Links: Primary color (`text-primary`) with hover underline

### Spacing
- Main content padding: `p-6`
- Footer padding: `py-4`
- Consistent gap spacing: `space-y-6` for sections

## Testing Checklist

✅ Sidebar highlighting active route  
✅ Footer visible on all pages  
✅ Topbar sticky on scroll  
✅ No double scrollbars  
✅ Responsive collapse/expand behavior  
✅ Role-based menu filtering  
✅ Cross-browser compatibility

## Future Enhancements

- Dark mode support (components ready, needs toggle)
- Sidebar customization per user role
- Footer customization per tenant
- Mobile-optimized navigation drawer
