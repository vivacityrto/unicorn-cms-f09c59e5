

## Client Portal: Help Center, Chatbot-First Flow, and Updated Home + Footer

### Overview

Build a full Help Center experience for client users with three working tabs (Chatbot, Message CSC, Support), a new client Home page at `/dashboard` with "What do you need?" action cards, and an updated website-style footer. All communications are tenant-scoped and logged.

---

### Database Changes

#### New Table: `help_threads`

Tenant-scoped messaging threads for Chatbot, CSC, and Support conversations.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `tenant_id` | integer NOT NULL | FK to `tenants.id` |
| `user_id` | uuid NOT NULL | FK to `auth.users(id)` |
| `channel` | text NOT NULL | `'chatbot'`, `'csc'`, or `'support'` |
| `status` | text NOT NULL | Default `'open'` |
| `subject` | text | Optional subject line |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

#### New Table: `help_messages`

Individual messages within threads.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `thread_id` | uuid NOT NULL | FK to `help_threads.id` |
| `sender_id` | uuid NOT NULL | FK to `auth.users(id)` |
| `role` | text NOT NULL | `'user'`, `'assistant'`, `'staff'` |
| `content` | text NOT NULL | Message body |
| `metadata` | jsonb | Sources, attachments, etc. |
| `created_at` | timestamptz | Default `now()` |

#### RLS Policies

- Users can read/insert threads and messages where they are the author OR are Vivacity staff with tenant access
- Uses existing `has_tenant_access_safe()` and `is_vivacity_team_safe()` helpers

---

### Edge Function: `help-center-chat`

A new edge function that handles the chatbot tab for client users.

- Accepts `{ channel: 'chatbot', message: string, thread_id?: string, tenant_id: number }`
- Creates a `help_threads` row if no `thread_id` provided
- Saves user message to `help_messages`
- Calls the existing `assistant-answer` function logic (or OpenAI directly) for chatbot responses
- Saves assistant response to `help_messages`
- Returns the response with thread context
- All interactions logged to tenant via `help_threads.tenant_id`

---

### New Components

#### `src/components/help-center/HelpCenterDrawer.tsx`

A `Sheet` (right-side drawer) with three tabs:

1. **Chatbot** (default) -- "Ask a compliance question"
   - Conversation history from `help_threads` where `channel = 'chatbot'`
   - Input field sends to `help-center-chat` edge function
   - Shows transcript saved to tenant
   - Header: "Start with the chatbot for fast answers."

2. **Message CSC** -- "Send a message to your consultant"
   - In-app threaded messaging using `help_threads` where `channel = 'csc'`
   - User creates messages, CSC replies appear when staff respond
   - Shows conversation history
   - Supports text messages (attachments deferred to follow-up)
   - Header: "If you still need help, message your CSC."

3. **Support** -- "For technical issues and access help"
   - In-app threaded messaging using `help_threads` where `channel = 'support'`
   - Same UI as CSC tab but for support channel
   - Fallback text: "Prefer in-app so we can track everything."
   - Shows `support@vivacity.com.au` as secondary option, not primary

#### `src/components/help-center/HelpCenterContext.tsx`

React context to manage drawer open/close state and active tab selection. Allows any component (TopBar button, footer links, Home page cards) to open the Help Center to a specific tab.

#### `src/components/help-center/ChatTab.tsx`

Chatbot conversation UI -- message list, input, loading states. Reuses patterns from `AskVivPanel` but simplified for client users (no scope lock, no explain sources, no compliance mode).

#### `src/components/help-center/MessageTab.tsx`

Shared component for CSC and Support tabs -- threaded message list with input. Shows thread history, allows new messages, displays staff replies.

---

### Modified Files

#### `src/components/layout/TopBar.tsx`

- Add a Help button (HelpCircle icon) in the right-side actions area
- Visible for client roles (Admin/User) -- hidden for Vivacity team who use Ask Viv instead
- Clicking opens `HelpCenterDrawer` via context

#### `src/pages/Dashboard.tsx`

- Stop redirecting Admin/User roles to tenant detail page
- Render a new client Home page with three rows:

**Row 1: "What do you need?" (3 cards)**
- Ask the Chatbot (primary, cyan button) -- opens Help Center Chatbot tab
- Message your CSC (secondary) -- opens Help Center CSC tab
- Support (secondary) -- opens Help Center Support tab

**Row 2: "Your next items" (2 panels)**
- Upcoming reminders (next 7-14 days) -- tasks, meetings, obligations list with "Open calendar" CTA
- Unread notifications -- simple list with "View all notifications" CTA

**Row 3: Quick links**
- Documents, Calendar, Resource Hub, Contact CSC, Ask Chatbot

#### `src/components/client/ClientFooter.tsx`

Updated to match the website-style design:

- **Background**: dark purple (`#44235F`) instead of white -- matches Vivacity website tone
- **Text**: white/light for contrast
- **Column 1 -- Vivacity**: Company name, ABN, Phone, Support email
- **Column 2 -- Get Help**: "Ask the chatbot", "Message your CSC", "Contact support" -- all open Help Center to the appropriate tab. Small note: "Messages are saved to your account."
- **Column 3 -- Quick Links**: Documents, Calendar, Notifications, Resource Hub
- **Bottom**: Gradient strip (`#7130A0` to `#ed1878`), copyright line
- Optional: Privacy and Terms links if routes exist

#### `src/components/DashboardLayout.tsx`

- Import and provide `HelpCenterProvider` context wrapper
- Render `HelpCenterDrawer` inside the layout (available on all client pages)

#### `src/pages/ClientPreview.tsx`

- Add Help Center drawer and Help button in preview nav
- Render updated `ClientFooter` at the bottom

---

### Files Summary

| File | Action | Purpose |
|---|---|---|
| `src/components/help-center/HelpCenterContext.tsx` | Create | Drawer state and tab context |
| `src/components/help-center/HelpCenterDrawer.tsx` | Create | Main drawer with 3 tabs |
| `src/components/help-center/ChatTab.tsx` | Create | Chatbot conversation UI |
| `src/components/help-center/MessageTab.tsx` | Create | CSC and Support messaging UI |
| `supabase/functions/help-center-chat/index.ts` | Create | Chatbot edge function |
| `src/pages/Dashboard.tsx` | Modify | New client Home page |
| `src/components/client/ClientFooter.tsx` | Modify | Dark purple website-style footer |
| `src/components/layout/TopBar.tsx` | Modify | Add Help button for clients |
| `src/components/DashboardLayout.tsx` | Modify | Wrap with HelpCenterProvider |
| `src/pages/ClientPreview.tsx` | Modify | Add Help Center + footer |

### Database Migration

- Create `help_threads` table with RLS
- Create `help_messages` table with RLS
- Add `updated_at` trigger for `help_threads`
- No changes to existing tables

### Acceptance Criteria

- Client can access Help Center from TopBar, Home page cards, and footer links
- Chatbot tab sends messages and receives AI responses, all saved to `help_threads`/`help_messages`
- CSC and Support tabs allow in-app threaded messaging, tenant-scoped
- All conversations are logged to the tenant and auditable
- Footer matches dark website style with legal details (ABN 40 140 059 016, Phone 1300 729 455)
- Home page shows "What do you need?" cards with chatbot as primary action
- `support@vivacity.com.au` shown as fallback text, not primary action
- No `mailto:` as primary CTA anywhere

