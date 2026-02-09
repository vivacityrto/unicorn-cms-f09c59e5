# Unified Modal & Drawer System

This document describes the standardized modal and drawer components for Unicorn 2.0.

## Core Principles

1. **One system** - All pop-ups use the same base components
2. **Viewport-safe** - Never exceeds screen bounds
3. **Accessible** - Focus trapping, ARIA attributes, keyboard navigation
4. **Responsive** - Works at 320px width and up

## Components

### AppModal

Base modal component for centered dialogs.

```tsx
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/app-modal";

function MyDialog({ open, onOpenChange }) {
  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>Dialog Title</AppModalTitle>
          <AppModalDescription>Optional description</AppModalDescription>
        </AppModalHeader>
        
        <AppModalBody>
          {/* Scrollable content */}
        </AppModalBody>
        
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button>Confirm</Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
```

**Size variants:**

| Size | Max Width | Use Case |
|------|-----------|----------|
| `xs` | 320px | Small confirmations |
| `sm` | 384px | Simple dialogs |
| `md` | 512px | Default |
| `lg` | 640px | Forms |
| `xl` | 768px | Complex forms |
| `2xl` | 896px | Large content |
| `full` | 1152px | Full-width |

### AppDrawer

Slide-in panel for dense forms and long content.

```tsx
import {
  AppDrawer,
  AppDrawerContent,
  AppDrawerHeader,
  AppDrawerTitle,
  AppDrawerDescription,
  AppDrawerBody,
  AppDrawerFooter,
} from "@/components/ui/app-drawer";

function MyDrawer({ open, onOpenChange }) {
  return (
    <AppDrawer open={open} onOpenChange={onOpenChange} side="right">
      <AppDrawerContent size="lg">
        <AppDrawerHeader>
          <AppDrawerTitle>Drawer Title</AppDrawerTitle>
        </AppDrawerHeader>
        
        <AppDrawerBody>
          {/* Scrollable content */}
        </AppDrawerBody>
        
        <AppDrawerFooter>
          <Button>Save</Button>
        </AppDrawerFooter>
      </AppDrawerContent>
    </AppDrawer>
  );
}
```

### ConfirmDialog

Pre-built confirmation dialog with variants.

```tsx
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function DeleteConfirm({ open, onOpenChange, onDelete }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Item"
      description="This action cannot be undone."
      itemName="Document.pdf"
      onConfirm={onDelete}
      confirmText="Delete"
      variant="destructive"
      isLoading={isDeleting}
    />
  );
}
```

**Variants:**
- `destructive` - Red, for delete actions
- `warning` - Amber, for caution
- `info` - Blue, for information
- `success` - Green, for confirmations

### FormModal

Optimized modal for forms.

```tsx
import { FormModal, FormModalSection, FormModalRow } from "@/components/ui/form-modal";

function EditForm({ open, onOpenChange }) {
  const handleSubmit = async (e) => {
    // Handle form submission
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Details"
      description="Update the information below."
      onSubmit={handleSubmit}
      isSubmitting={isLoading}
      size="lg"
    >
      <FormModalSection title="Basic Info">
        <FormModalRow>
          <Input label="First Name" />
          <Input label="Last Name" />
        </FormModalRow>
      </FormModalSection>
    </FormModal>
  );
}
```

## Layout Rules

### Sizing

```
Width:  w-[min(92vw, maxWidth)]  → Responsive, never exceeds viewport
Height: max-h-[85vh]             → Leaves space for context
```

### Structure

```
┌──────────────────────────────┐
│ Header (sticky)              │ ← Always visible
│ - Title                      │
│ - Description (optional)     │
│ - Close button               │
├──────────────────────────────┤
│ Body (scrollable)            │ ← overflow-y-auto
│                              │
│                              │
│                              │
├──────────────────────────────┤
│ Footer (sticky)              │ ← Always visible
│ - Actions                    │
└──────────────────────────────┘
```

### Responsive Footer

Buttons stack on mobile, row on desktop:

```tsx
<AppModalFooter>
  {/* These will stack on mobile, row on sm+ */}
  <Button variant="outline">Cancel</Button>
  <Button>Confirm</Button>
</AppModalFooter>
```

## Accessibility

### Focus Management

- Focus is trapped inside the modal
- First focusable element receives focus on open
- Focus returns to trigger element on close

### ARIA Attributes

```tsx
// Automatically applied:
<div
  role="dialog"
  aria-labelledby={titleId}      // Links to title
  aria-describedby={descriptionId} // Links to description
  aria-modal="true"
/>
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Move focus forward |
| `Shift+Tab` | Move focus backward |
| `Escape` | Close (unless isBlocking) |
| `Enter` | Activate focused button |

### Tab Order

1. Close button (if visible)
2. Content elements
3. Cancel/secondary action
4. Primary action

## Blocking Mode

Prevents accidental close during important operations:

```tsx
<AppModal 
  open={open} 
  onOpenChange={onOpenChange}
  isBlocking={isSubmitting}  // Prevents close during submission
>
```

When blocking:
- ESC key does not close
- Backdrop click does not close
- Close button is disabled

## Migration Guide

### Before (old pattern)

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      {/* Content */}
    </div>
    <DialogFooter>
      <Button>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### After (new pattern)

```tsx
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from "@/components/ui/app-modal";

<AppModal open={open} onOpenChange={setOpen}>
  <AppModalContent size="lg">
    <AppModalHeader>
      <AppModalTitle>Title</AppModalTitle>
    </AppModalHeader>
    <AppModalBody>
      {/* Content */}
    </AppModalBody>
    <AppModalFooter>
      <Button>Save</Button>
    </AppModalFooter>
  </AppModalContent>
</AppModal>
```

### For confirmations

```tsx
// Before
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete?</AlertDialogTitle>
      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

// After
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Delete?"
  description="This cannot be undone."
  onConfirm={handleDelete}
  variant="destructive"
/>
```

## Testing Checklist

- [ ] Works at 320px width
- [ ] Works at 375px width
- [ ] Works at 768px width
- [ ] Works at 1280px width
- [ ] Long titles wrap correctly
- [ ] Long button text doesn't overflow
- [ ] Body scrolls when content is tall
- [ ] Header stays visible when scrolling
- [ ] Footer stays visible when scrolling
- [ ] ESC key closes modal
- [ ] Clicking backdrop closes modal
- [ ] Tab navigation works correctly
- [ ] Focus returns to trigger on close
