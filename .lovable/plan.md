## Add `useTransitions={false}` to BrowserRouter

### Context
The app was upgraded from react-router-dom v6 to v7 on 26 June. In React Router v7, `startTransition` is enabled by default on all navigations, which causes the old page to remain frozen on screen until the new page fully renders. Setting `useTransitions={false}` restores the v6 behaviour where the Suspense fallback shows immediately on navigation.

### Changes
- **src/App.tsx** (~line 275): Add `useTransitions={false}` prop to the `<BrowserRouter>` component.

### No other files touched
No routing logic, navigation calls, or component structure will be modified.