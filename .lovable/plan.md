## Fix: Client package action buttons route to wrong destinations

**File:** `src/components/client/package-dashboard/PackageActionRow.tsx`

### Changes

1. **"Open tasks" link** — change target from `/tasks?package_instance_id=${packageInstanceId}` (staff route) to `/client/tasks?package_instance_id=${packageInstanceId}`.

2. **"Message CSC" button** — replace the `mailto:` anchor with a plain in-app `<Link to="/client/inbox?tab=messages">`. Remove:
   - `managerEmail` `useState`
   - `useEffect` fetching `users.email` from Supabase
   - `asChild={!!managerEmail}` / `disabled` / `title` conditional logic
   - The `<a href="mailto:...">` and the disabled `<span>` fallback
   - `supabase` import and `useEffect`/`useState` imports (no longer needed)

3. **Props** — remove `managerId` from the `Props` interface and component signature. Parent `ClientPackagesPage.tsx` still passes it, which is harmless (TypeScript will accept extra props passed via JSX only if the prop is in the interface — so the parent call site needs verification; if TS complains, it must be removed from the parent too. Per instructions, do not modify the parent. If the build fails, the prop will be silently accepted at runtime but flagged at compile. Will verify after edit and only touch parent if necessary to keep build green).

4. **"Book consult" button** — untouched.

### Resulting file

```tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CalendarPlus, ListChecks, MessageSquare } from 'lucide-react';

interface Props {
  packageInstanceId: number;
}

export function PackageActionRow({ packageInstanceId }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <Link to={`/consults/new?package_instance_id=${packageInstanceId}`}>
          <CalendarPlus className="h-4 w-4 mr-1.5" />
          Book consult
        </Link>
      </Button>

      <Button asChild size="sm" variant="secondary">
        <Link to={`/client/tasks?package_instance_id=${packageInstanceId}`}>
          <ListChecks className="h-4 w-4 mr-1.5" />
          Open tasks
        </Link>
      </Button>

      <Button asChild size="sm" variant="secondary">
        <Link to="/client/inbox?tab=messages">
          <MessageSquare className="h-4 w-4 mr-1.5" />
          Message CSC
        </Link>
      </Button>
    </div>
  );
}
```

### Not changed
- `ClientPackagesPage.tsx`, `/client/tasks`, `/client/inbox`, RLS, DB, the Book consult button.
