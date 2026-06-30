## Plan — Two Isolated Fixes

### Prompt 1 — useNotifications.tsx (unique channel name)
In `src/hooks/useNotifications.tsx`, change the hardcoded Supabase realtime channel name from:
```
supabase.channel('user-notifications-changes')
```
to:
```
supabase.channel(`user-notifications-${userId}`)
```
This prevents duplicate channel subscription collisions when multiple components use the hook simultaneously.

### Prompt 2 — ChunkErrorBoundary.tsx (Vite 8 preload error handling)
In `src/components/ChunkErrorBoundary.tsx`, add:
1. A class property declaration: `handleVitePreloadError!: (event: Event) => void;`
2. A `componentDidMount()` method that adds a `vite:preloadError` window event listener
3. A `componentWillUnmount()` method that removes that listener

The handler will set `hasError: true` and `reloading: true`, then reload the page once (guarded by sessionStorage, same as existing `componentDidCatch` logic). If the reload was already attempted, it shows the manual reload card.

No other logic in either file will be changed.