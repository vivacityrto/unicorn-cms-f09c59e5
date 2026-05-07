## Goal

Show real per-message sender avatar + name in three messaging surfaces. Staff senders without a resolved name display as "Vivacity Team".

Scope: 3 files. No RLS, migrations, edge functions, or other files.

---

## 1. `src/hooks/useClientCommunications.ts`

- Add `sender_avatar_url: string | null` to the `ConversationMessage` interface.
- In `useConversationMessages` queryFn:
  - Extend users select to `'user_uuid, first_name, last_name, avatar_url'`.
  - Build `avatarMap: Map<string, string | null>` alongside `nameMap`.
  - Apply name fallback per-row at map time: when name is empty, use `'Vivacity Team'` if `m.sender_type === 'staff'`, else `'Unknown'`.
  - Set `sender_avatar_url: avatarMap.get(m.sender_user_uuid) ?? null` on each mapped message.

## 2. `src/pages/TeamCommunicationsPage.tsx`

- Import `Avatar`, `AvatarImage`, `AvatarFallback` from `@/components/ui/avatar`.
- Add only `sender_avatar_url: string | null` to the `Message` interface (sender_user_uuid already present).
- In the messages query (~line 161):
  - Extend users select to include `avatar_url`.
  - Build `avatarMap` alongside `nameMap`.
  - Per-row fallback: empty name + `sender_type === 'staff'` → `'Vivacity Team'`, else `'Unknown'`.
  - Add `sender_avatar_url` to mapped objects.
- Render: replace the sender-name `<p>` at line 405 (the `{!isOwn && <p ...>{msg.sender_name}</p>}` line — actual line in current file is 510) with a small flex row: `<Avatar className="h-6 w-6">` containing `<AvatarImage src={msg.sender_avatar_url ?? undefined} />` and `<AvatarFallback>` showing initials (first letter of each word in `sender_name`), followed by the name text using existing `text-xs font-medium text-muted-foreground` styling.

## 3. `src/components/help-center/MessageTab.tsx` (CSC branch only)

- Extend `Message` interface to add `sender_user_uuid: string`.
- Add component state: `staffNameMap` and `staffAvatarMap` (`Map<string, string>` / `Map<string, string | null>`).
- In `loadCscThread` after fetching `rows`:
  - Carry `sender_user_uuid: r.sender_user_uuid` through the initial mapping (line 208).
  - Collect unique staff sender UUIDs (rows where `sender_user_uuid !== myUuid`), single `users` lookup for `user_uuid, first_name, last_name, avatar_url`, populate both maps via `setStaffNameMap` / `setStaffAvatarMap`. Use `'Vivacity Team'` fallback for empty names.
- Realtime INSERT handler (line 259): include `sender_user_uuid` in the new message object. After updating `messages`, if `r.sender_user_uuid !== myUuid` and not already in `staffAvatarMap`, fire an incremental `users` select for that UUID and merge into both maps.
- Staff render block (lines 432-441): replace the existing single-CSC Avatar with a per-message Avatar resolved via the maps. `<AvatarImage src={staffAvatarMap.get(msg.sender_user_uuid) ?? undefined} />`, `<AvatarFallback className="text-[10px]">{initials}</AvatarFallback>` (initials derived from resolved name, defaulting to `"VT"`). Add a `text-xs font-medium text-muted-foreground` label above the bubble showing the staff first name (or `"Vivacity Team"` if unresolved). Wrap label + bubble in a `flex flex-col` so the label stacks above the message.
- Client (`role === 'user'`) messages: unchanged — generic `<User>` icon, no name label.
- Do not touch `cscProfile` (not present in this file per user clarification — ignore prior plan reference).

---

## Technical notes

- `sender_type` is a per-row column on `tenant_messages`, so the "Vivacity Team" fallback must be applied at row-mapping time rather than during map construction.
- `users.avatar_url` is already selectable under existing RLS (used by `useTenantUsers`, `useVivacityTeamUsers`).
- Realtime in `MessageTab` may deliver staff senders not yet in the identity map; fallback labels cover the gap and incremental fetch backfills.

## Risk

Low. Read-side rendering + identity resolution only. No mutation, schema, RLS, or send-flow impact.
