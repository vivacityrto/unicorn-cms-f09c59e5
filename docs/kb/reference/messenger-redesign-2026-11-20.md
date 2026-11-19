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
2. **Client Inbox rebuilt on the kit (in review).** The Messages tab is the kit, fed by `adapters/tenantConversations.ts`; data hooks (`useClientCommunications`) are unchanged apart from carrying each conversation's read position. New in the tab: a "Sending…" bubble while a message goes, a "New messages" divider and opening at it, Seen from other participants' read positions (refreshed every 20 seconds), drafts per conversation, and attachments refreshed after upload. The All and Notifications tabs, the New message dialog, deep links (`?thread=`, `?conversation=`) and broadcast replies are unchanged. Typing indicators wait for phase 3, when both sides of a conversation use the kit.
3. **The bubble as a dock.**
   - **3a, client portal (in review):** `MessengerDock` (a round launcher at the bottom right with a red unread count, and a panel in its place; full screen under the header on a phone). It holds Ask Viv (pinned; the old floating panel's logic, kept mounted so an answer in flight survives going back to the list), the primary consultant (an existing conversation with topic "csc", or a place to start one that creates it on the first message), notices from Vivacity and every other conversation. The Inbox and the bubble share `useClientConversationPane`. The launcher icon is `VivMessengerIcon`: the Vivacity logo's white shield, cyan V and purple to fuchsia cape drawn as a speech bubble, with a dark-mode variant. The back-to-top pill moved from the bottom centre to the top centre under the pinned header. Ask Viv still replies only to a question that was sent.
   - **3b, staff portal (in review):** the same dock for Vivacity staff (`StaffMessengerDock`, bottom right). Default view "My clients": conversations of the organisations `get_my_message_scope()` returns, which asks `resolve_notification_recipients` itself, so the bubble and the bell cannot disagree (own clients, clients covered as a delegate such as the all-CSC assistants, watched, and for Super Admins ones with no consultant); a chip says why ("Covering Nova", "Watching", "Unassigned"). An "All clients" switch shows everyone's. Unread is taken from the message notifications routing sent the person, not from participant rows (which fixes delegates and reassigned consultants having no unread state). Reading a conversation that is mine records the read position (and shows the client "Seen") without calling `fn_mark_conversation_read`, which is written for clients. Ask Viv for staff stays its own panel and appears as a thread only when its launcher flag is on; the old staff Ask Viv floating launcher at the bottom right is replaced by the bubble. The separate rollout-flagged Ask Viv assistant widget at the bottom left is unchanged. The migration is applied to production (20 November 2026).
   - Still open for phase 3: one realtime listener instead of several, and typing indicators.
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
