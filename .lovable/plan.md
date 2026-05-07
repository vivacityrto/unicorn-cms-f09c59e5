Replace the generic headphones icon next to staff messages in `src/components/help-center/MessageTab.tsx` (CSC channel) with the assigned CSC's profile photo, falling back to initials, then headphones.

### Changes (single file: src/components/help-center/MessageTab.tsx)

1. Import `Avatar, AvatarFallback, AvatarImage` from `@/components/ui/avatar`.
2. Add state: `cscProfile: { avatar_url, first_name, last_name } | null` (default null). Reset to null alongside the other resets when channel/profile changes.
3. In `loadCscThread`, after fetching `cscRow` and before the CSC participant upsert: if `cscRow?.csc_user_id`, query `users` for `avatar_url, first_name, last_name` by `user_uuid` and `setCscProfile` (guarded by `cancelled`).
4. In the message renderer, replace the staff-side headphones icon block with an `Avatar` (h-7 w-7):
   - `AvatarImage` from `cscProfile.avatar_url` when present.
   - `AvatarFallback` shows uppercase initials from `cscProfile.first_name[0] + last_name[0]`, falling back to `<Headphones>` icon when no profile loaded.

No DB, RLS, migration, or other file changes. Support channel rendering unchanged.
