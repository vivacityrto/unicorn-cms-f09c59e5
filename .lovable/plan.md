## Plan: Stop redundant thread auto-selection in TeamCommunicationsPage

Single file: `src/pages/TeamCommunicationsPage.tsx`. No other files, no DB changes.

### Problem
The effect at lines 95–100 reads `?thread=` from the URL and calls `setSelectedId(threadId)` whenever `conversations` or `searchParams` change. Since the realtime subscription refreshes `conversations` on every new message, the effect re-runs and re-selects the same thread repeatedly, firing the messages query redundantly.

### Change
`useRef` is already imported (line 1), so no import change is needed.

Add a ref directly above the existing effect, and gate auto-selection on the URL thread differing from the last auto-selected one:

```tsx
const lastAutoSelectedRef = useRef<string | null>(null);

useEffect(() => {
  const threadId = searchParams.get('thread');
  if (threadId && conversations.length > 0 && threadId !== lastAutoSelectedRef.current) {
    lastAutoSelectedRef.current = threadId;
    setSelectedId(threadId);
  }
}, [conversations, searchParams]);
```

This replaces lines 95–100. Navigating from `?thread=A` to `?thread=B` still works because the ref only blocks re-selecting the same ID.

### Out of scope
No other effects, hooks, files, RLS, or DB changes.