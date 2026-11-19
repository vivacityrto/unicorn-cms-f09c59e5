# Messenger redesign (client bubble, Inbox, staff messaging, Help Center retirement)

Status as of 20 November 2026: **phase 1 (foundations) in review; the conversation access migration is applied to production, as is the broadcast recipient migration (PR 1604, whose edge function change deploys on merge).** Approved by Carl on 20 November 2026 with these decisions: tighten conversation access first; tickets appear as threads through an adapter, not merged into the conversation tables; schema-backed features (replies, edit and delete, reactions, pin and mute, search) come last; Help Center is removed as code only and its tables are kept until a later approved cleanup.

## Why

Four separate chat implementations existed (client Inbox, staff Communications, the Manage Client Messages tab, Help Center's CSC tab), each with its own composer, bubbles and send logic. The Ask Viv bubble and Help Center were two different bots. Clients had no single place to talk to Viv, their consultant and support.

## Shape

One kit, `src/components/messenger/`, fed by thread sources:

- **Contract** (`types.ts`): `MessengerThread`, `MessengerMessage`, `MessengerPerson` and `ThreadSource`. A source turns its own tables into these shapes; the components never know which table a thread came from.
- **Components:** `Messenger` (list plus conversation; `page` mode is two panes from the xl breakpoint, `dock` mode is one pane at a time for the bubble), `ThreadList`, `ConversationPane`, `MessageTimeline`, `Composer`.
- **Logic** (`messengerLogic.ts`, pure and tested): grouping, day dividers, "New messages", Seen from participants' read positions, typing label, filter and search, drafts.
- **Thread types:** Ask Viv, Your CSC, Support (a ticket is a thread with a status chip), From Vivacity (broadcasts, read only), Package, Task, Rock, General, Direct.
- **Rules kept:** client-written text is plain text (links only for http and https); drafts survive switching threads; Ask Viv replies only ever on a user action (no automatic AI).
- **No new dependency in phase 1.** Long threads show the newest 60 messages with "Show earlier messages". Virtualisation (react-virtuoso) can be added later if threads grow; verify its licence and status on npm first.

## Phases

1. **Foundations (this PR):** conversation access migration (applied) and the kit with tests.
2. Client Inbox rebuilt on the kit.
3. The bubble as a dock: Ask Viv, Your CSC and other threads, one realtime listener instead of several.
4. Support tickets as threads, then Help Center removal (11 call sites repointed; `help-center-chat` and `help_threads` / `help_messages` kept until a later approved cleanup).
5. Staff Communications and the Manage Client Messages tab on the kit.
6. Schema-backed features: replies, edit and delete, reactions, pin and mute, search.

## Read first before changing messaging

`docs/kb/codebase-state/messaging-pipeline.md`, `support-tickets-overhaul-2026-11-13.md`, `client-portal-redesign-2026-11-19.md` (the Inbox crash audit: realtime channels must use `uniqueChannelName`), `notification-redesign-2026-11-17.md`, and the audit entry `2026-11-20-restrict-conversation-access-to-participants`.

## Broadcast messages (must not break)

Broadcasts are delivered by `send-broadcast-campaign` and the scheduled-delivery path with the service role: one conversation per organisation (`type = 'broadcast'`), the sender plus every `tenant_users` row as participants, and read tracking in `broadcast_recipients` through `fn_mark_conversation_read`. The messenger treats them as read-only threads under "From Vivacity", and the Inbox source marks them read through that function so `broadcast_recipients.read_at` and the audit entries keep working. Staff Communications, bulk message history and scheduling are not changed by phases 1 to 4.

## Open items

- Resolved by PR 1604 (migration applied 20 November 2026): broadcast recipients are active `tenant_members` (ADR-019); 4 active members with no `tenant_users` row are now reached, and an immediate send adds only recipients as participants.
- Whether a user added to an organisation after a broadcast should be added to earlier broadcasts as a participant (the access change hides broadcasts they were never in).
- A later primary CSC reassignment does not update participants on existing threads.
- `fn_tm_on_message_insert` writes `/client/inbox?...` as the link for everyone, including staff.
- Several staff realtime channels still use fixed names (`useTeamUnreadCount`, `ClientMessagesTab`, `TeamCommunicationsPage`).
