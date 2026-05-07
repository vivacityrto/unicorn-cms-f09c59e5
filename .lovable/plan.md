Scope: `src/pages/TeamCommunicationsPage.tsx` only. No RLS, no migrations, no other files.

## Change 1 — Two-section conversation list

Within the existing scrollable list, render two labelled groups:

- **"Your Conversations"** — conversations where the current user (`currentUserId`) is in `conversation_participants`.
- **"Team Conversations"** — all other conversations the user can see.

Both sorted by `last_message_at` desc (already the order from the query). Section header omitted when its group is empty.

### Implementation
- Reuse the existing participants fetch in the `team-conversations` query (lines 89–99). The current call already returns `conversation_id` rows for the current user; build `mineSet = new Set(participants.map(p => p.conversation_id))` from that same result.
- Add `isMine: boolean` to each `Conversation`.
- After computing `filtered` (tenant + new staff filter), partition into `mine = filtered.filter(c => c.isMine)` and `team = filtered.filter(c => !c.isMine)`.
- Replace the single `filtered.map(...)` block with two consecutive groups, each preceded by a section header (`text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2 bg-muted/30`). Skip header + group if empty.

## Change 2 — Staff filter dropdown

Add a second `Select` next to the tenant filter, default label "All Team Members".

### Data
- Import and call the existing hook:
  ```ts
  import { useVivacityTeamUsers } from "@/hooks/useVivacityTeamUsers";
  const { data: staffUsers = [] } = useVivacityTeamUsers();
  const staffOptions = staffUsers.map(u => ({
    id: u.user_uuid,
    name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
  }));
  ```
  (No new `useQuery` — the hook already filters to `Super Admin`/`Team Leader`/`Team Member`, `archived=false`, `disabled=false`, ordered by first name.)

- New state: `const [filterStaff, setFilterStaff] = useState<string>("all");`

- New `useQuery(["team-comms-staff-conv-ids", filterStaff], …, { enabled: filterStaff !== "all" })` fetching `conversation_participants.conversation_id` where `user_id = filterStaff`; returns `Set<string>`.

### Filtering
```ts
const filteredByTenant = filterTenant === "all"
  ? conversations
  : conversations.filter(c => String(c.tenant_id) === filterTenant);

const filtered = filterStaff === "all" || !staffConvIds
  ? filteredByTenant
  : filteredByTenant.filter(c => staffConvIds.has(c.id));
```

Both filters additive. Your/Team split still uses `currentUserId`, not the selected staff person.

### UI
```tsx
<Select value={filterStaff} onValueChange={setFilterStaff}>
  <SelectTrigger className="w-[220px]">
    <SelectValue placeholder="All Team Members" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Team Members</SelectItem>
    {staffOptions.map(s => (
      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

## Out of scope
`useConversationRealtime`, `sendMessage`, `lastAutoSelectedRef`, `last_read_at` stamping, `user_notifications` mark-read, `NewTeamMessageDialog`, RLS, migrations, edge functions, any other file.

## Risk
Minimal. All changes are client-side state + render in a single file. Reuses an existing hook (`useVivacityTeamUsers`) and an existing participants fetch. Default behaviour (both filters = "all") is unchanged because the staff-conv-ids query is gated by `enabled`.
