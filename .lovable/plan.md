

## Release Notes Tab on Suggestion Register

### Approach
Add a **Tabs** component to the Suggestion Register page with two tabs:
1. **Suggestions** (default) — the existing table/filters, unchanged
2. **Released** — a list of released suggestions ordered by `released_at` descending

### Released Tab Design
- Fetches suggestions where `release_status.code === 'released'`, ordered by `released_at DESC`
- Each item rendered as a Card showing:
  - **Title** (clickable, navigates to `/suggestions/:id`)
  - **Release Notes** text
  - **Reported By** name
  - **Created** date and **Released** date
- Simple search filter on title/release notes

### Code Changes

| File | Change |
|------|--------|
| `SuggestionRegister.tsx` | Wrap content in `Tabs` with two `TabsContent` sections. Extract existing table into "Suggestions" tab. Add "Released" tab with its own query and card list layout. |
| `useSuggestItems.ts` | Add a `useReleasedSuggestItems()` hook that queries `suggest_items` joined with `release_status` where `release_status.code = 'released'`, ordered by `released_at DESC` |

No database changes needed — all data already exists.

