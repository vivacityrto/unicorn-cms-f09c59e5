# Fix blank screen on invitation validation failure

## Problem
`src/pages/AcceptInvitation.tsx` lines 280–282 currently returns `null` when `invitationData` is null, leaving guest users stranded on a blank white page after a brief toast — no explanation, no retry path.

## Change (single edit, one file)

**File:** `src/pages/AcceptInvitation.tsx`
**Lines:** 280–282

Replace:
```tsx
if (!invitationData) {
  return null;
}
```

With:
```tsx
if (!invitationData && !validating) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <h2 className="text-xl font-semibold text-center">
        Invalid or expired invitation
      </h2>
      <p className="text-muted-foreground text-center max-w-sm">
        This invitation link may have expired or already been used.
        Please contact your administrator for a new invitation.
      </p>
      <Button variant="outline" onClick={validateToken}>
        Try again
      </Button>
    </div>
  );
}
```

## Why the `!validating` guard matters
`invitationData` starts as `null`, so without the guard the error UI flashes on every page load before the RPC resolves. The existing validating spinner block (lines 270–278) already handles the loading state and remains untouched.

## Out of scope (untouched)
- `validateToken` function
- `useEffect` at lines 37–39
- Validating spinner branch (lines 270–278)
- Happy-path form render (line 284 onward)
- `handleSubmit`, `finalizeInvitation`, `navigate` logic
- No new state, no React Query, no other files

`Button` is already imported (line 3), so no new imports required.
