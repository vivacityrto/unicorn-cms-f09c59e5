## Fix: "Book consult" button rendering as filled instead of outline

In `src/components/client/ClientHomePage.tsx`, the `bookBtn` in `CSCCard` uses `<Button asChild={hasCSC} variant="outline">` wrapping a `<Link>`. The Radix Slot pattern isn't propagating the outline classes to the rendered anchor, so it renders as the default filled style.

### Changes

**1. Imports (line 15)** — add `buttonVariants` and `cn`:
```ts
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

**2. Replace `bookBtn` definition (lines 154–168)** with two distinct render paths, no `asChild`:
```tsx
const bookBtn = hasCSC ? (
  <Link
    to="/client/calendar"
    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
  >
    <CalendarPlus className="h-4 w-4 mr-1.5" />
    Book consult
  </Link>
) : (
  <Button size="sm" variant="outline" disabled className="cursor-not-allowed">
    <CalendarPlus className="h-4 w-4 mr-1.5" />
    Book consult
  </Button>
);
```

The surrounding tooltip wrapper (lines 202–213) still works — it wraps `bookBtn` in a `<span>` for the disabled case.

### Out of scope
- QuickActionsRow "Book consult" card (separate, intentional emphasis)
- Message button, avatar, name, email
- Routing, tooltip logic, RLS