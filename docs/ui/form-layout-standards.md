# Form Layout Standards

This document defines the standardized form primitives and layout rules for all forms in Unicorn 2.0.

## Quick Start

```tsx
import {
  FormSection,
  FieldRow,
  FieldGroup,
  FieldLabel,
  FieldHint,
  FieldError,
  FormGrid,
  FormActions,
  FormDivider,
} from "@/components/ui/form-primitives";
```

## Layout Rules

### Column Layout

| Breakpoint | Columns | Behaviour |
|------------|---------|-----------|
| < 640px (mobile) | 1 | Always single column |
| ≥ 768px (md) | 1-2 | Two columns when safe |
| ≥ 1024px (lg) | 1-3 | Three columns for grids |

**Rule**: Never force side-by-side fields at 320px width.

### Spacing Scale

| Context | Spacing |
|---------|---------|
| Between fields | `space-y-4 md:space-y-5` |
| Between label and input | `gap-1.5` |
| Between sections | `mt-6 md:mt-8` |
| Grid gap | `gap-4 md:gap-6` |

---

## Components

### FormSection

Groups related fields with optional title and description.

```tsx
<FormSection 
  title="Personal Information" 
  description="Enter your contact details"
  first // No top margin/border for first section
>
  <FieldGroup label="Name">
    <Input />
  </FieldGroup>
</FormSection>
```

### FieldRow

Horizontal layout for 1-2 fields. Single column on mobile, two columns at md+.

```tsx
<FieldRow>
  <FieldGroup label="First Name" required>
    <Input />
  </FieldGroup>
  <FieldGroup label="Last Name" required>
    <Input />
  </FieldGroup>
</FieldRow>

// Force single column
<FieldRow singleColumn>
  <FieldGroup label="Full Address">
    <Textarea />
  </FieldGroup>
</FieldRow>
```

### FieldGroup

Complete field with label, input, hint, and error handling.

```tsx
<FieldGroup
  label="Email Address"
  htmlFor="email"
  required
  hint="We'll use this for notifications"
  error={errors.email?.message}
>
  <Input id="email" type="email" {...register("email")} />
</FieldGroup>
```

**Props:**
- `label` - Field label text
- `htmlFor` - Associates label with input (accessibility)
- `required` - Shows required indicator (*)
- `hint` - Helper text below input
- `error` - Error message (shows instead of hint when present)

### FormGrid

Responsive grid for multiple fields.

```tsx
<FormGrid columns={3}>
  <FieldGroup label="City"><Input /></FieldGroup>
  <FieldGroup label="State"><Input /></FieldGroup>
  <FieldGroup label="Postcode"><Input /></FieldGroup>
</FormGrid>
```

### FormActions

Container for submit/cancel buttons.

```tsx
<FormActions align="right">
  <Button variant="outline" type="button">Cancel</Button>
  <Button type="submit">Save Changes</Button>
</FormActions>

// Full width stacked on mobile
<FormActions align="between" stackOnMobile>
  <Button variant="ghost">Delete</Button>
  <div className="flex gap-3">
    <Button variant="outline">Cancel</Button>
    <Button>Save</Button>
  </div>
</FormActions>
```

---

## Input Sizing

### Minimum Heights

| Component | Min Height |
|-----------|------------|
| Input, Select | `h-10` (40px) |
| Textarea | `min-h-24` (96px) |
| Button | `h-10`, prefer `min-h-[44px]` on mobile |

### Touch Targets

All interactive elements should have a minimum touch target of 44px for mobile usability.

---

## Validation States

### Error Styling

```tsx
<FieldGroup
  label="Email"
  error={errors.email?.message}
  hasError={!!errors.email} // Optional: adds border styling to input
>
  <Input
    className={errors.email ? "border-destructive" : ""}
    {...register("email")}
  />
</FieldGroup>
```

### Error Message Behaviour

- Error appears below the input
- Error text wraps and does not shift layout
- Field border changes to destructive color
- Icon indicator for visibility

---

## Complete Form Example

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FormSection,
  FieldRow,
  FieldGroup,
  FormActions,
} from "@/components/ui/form-primitives";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof schema>;

export function UserForm({ onSubmit, onCancel }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormSection title="Personal Information" first>
        <FieldRow>
          <FieldGroup
            label="First Name"
            htmlFor="firstName"
            required
            error={errors.firstName?.message}
          >
            <Input id="firstName" {...register("firstName")} />
          </FieldGroup>
          <FieldGroup
            label="Last Name"
            htmlFor="lastName"
            required
            error={errors.lastName?.message}
          >
            <Input id="lastName" {...register("lastName")} />
          </FieldGroup>
        </FieldRow>
      </FormSection>

      <FormSection title="Contact Information">
        <FieldGroup
          label="Email Address"
          htmlFor="email"
          required
          hint="We'll use this for account notifications"
          error={errors.email?.message}
        >
          <Input id="email" type="email" {...register("email")} />
        </FieldGroup>

        <FieldGroup
          label="Phone Number"
          htmlFor="phone"
          hint="Optional - for urgent communications only"
        >
          <Input id="phone" type="tel" {...register("phone")} />
        </FieldGroup>
      </FormSection>

      <FormSection title="Additional Notes">
        <FieldGroup
          label="Notes"
          htmlFor="notes"
          hint="Any additional information (max 500 characters)"
          error={errors.notes?.message}
        >
          <Textarea id="notes" rows={4} {...register("notes")} />
        </FieldGroup>
      </FormSection>

      <FormActions>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </FormActions>
    </form>
  );
}
```

---

## Forms in Modals/Drawers

For long forms inside modals or drawers:

1. Use `FormModal` from `@/components/ui/modals`
2. Keep submit buttons in sticky footer
3. Only body content scrolls

```tsx
import { FormModal, FormModalSection, FormModalRow } from "@/components/ui/modals";

<FormModal
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Edit User"
  onSubmit={handleSubmit}
  submitText="Save Changes"
  isSubmitting={isLoading}
>
  <FormModalSection title="Personal Details">
    <FormModalRow>
      <FieldGroup label="First Name" required>
        <Input />
      </FieldGroup>
      <FieldGroup label="Last Name" required>
        <Input />
      </FieldGroup>
    </FormModalRow>
  </FormModalSection>
</FormModal>
```

---

## Testing Checklist

- [ ] Form displays correctly at 320px width
- [ ] Labels wrap properly (no clipping)
- [ ] Hints wrap properly (no clipping)
- [ ] Error messages wrap properly (no clipping)
- [ ] Fields stack on mobile
- [ ] Touch targets are at least 44px
- [ ] Tab order is logical
- [ ] Submit button visible in modal forms
- [ ] No horizontal scroll at any breakpoint

---

## Migration Guide

When updating existing forms:

1. Import form primitives
2. Replace `<div className="space-y-4">` with `<FormSection>`
3. Replace manual label + input groups with `<FieldGroup>`
4. Replace `<div className="grid grid-cols-2">` with `<FieldRow>`
5. Move error display to `error` prop on `<FieldGroup>`
6. Test at 320px width

### Before

```tsx
<div className="space-y-4">
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="text-sm font-medium">Name</label>
      <input className="w-full border rounded p-2" />
      {error && <span className="text-red-500 text-sm">{error}</span>}
    </div>
  </div>
</div>
```

### After

```tsx
<FormSection first>
  <FieldRow>
    <FieldGroup label="Name" required error={errors.name?.message}>
      <Input {...register("name")} />
    </FieldGroup>
  </FieldRow>
</FormSection>
```
