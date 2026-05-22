## Goal
Remove the non-functional search input from the Client portal top bar (`src/components/client/ClientTopbar.tsx`).

## Changes
1. **Delete search state** — remove `const [searchQuery, setSearchQuery] = useState("");`.
2. **Delete search UI block** — remove the `{/* Center: Search */}` `<div>` containing the `<Search>` icon and `<Input>`.
3. **Drop `Search` import** from `lucide-react` — only used in the search block.
4. **Drop `Input` import** from `@/components/ui/input` — only used in the search block.
5. **Preserve `useState` import** — still needed for `notifFilter` state.

## Verification
- Search bar no longer renders on desktop (≥ md).
- Logo on left, notifications/help/profile on right remain untouched.
- No layout breakage or orphan imports.
- Staff TopBar.tsx and AcademyTopBar.tsx untouched.