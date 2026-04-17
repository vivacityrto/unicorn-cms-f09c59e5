

## Team User Onboarding & M365 Auto-Provisioning

### What's already built (re-use, don't rebuild)
- **DB foundation:** `lifecycle_checklist_templates` + `lifecycle_checklist_instances` tables, with `staff_onboarding` lifecycle type and 8 categories already seeded (Staff Details, M365 Groups, M365 Licenses, Software & Logins, Calendar Invitations, CRM, Training Portal, External Comms).
- **Admin UI:** `/admin/lifecycle-checklists` (LifecycleChecklistsAdmin.tsx) lets staff manage template steps per category.
- **M365 identity:** `user_microsoft_identities` table + `addin-auth-exchange` already capture MS user IDs after SSO.
- **Email rails:** Mailgun EU + `send-composed-email` (system relay) and `send-email-graph` (admin's Outlook) both exist — pick at send time is supported.
- **Quick invite:** `InviteUserDialog` + `invite-user` edge function stays as-is for quick adds.

### What's missing (this build)

#### 1. Provisioning Rules Matrix (Code Tables Manager)
New SuperAdmin-managed table `staff_provisioning_rules` keyed by `(role, location)` with arrays of M365 groups, license SKUs, software apps, and calendar invites. Seeded from your XLSM. Editable in Code Tables Manager.

```text
role            | location | m365_groups          | licenses    | software           | calendars
----------------|----------|----------------------|-------------|--------------------|-------------
Consultant      | AU       | [Consultants-AU,...] | [BUSPREM]   | [ClickUp,Calendly] | [TeamStandup]
Consultant      | PH       | [Consultants-PH,...] | [BUSBASIC]  | [ClickUp]          | [PHStandup]
Admin Assistant | PH       | [Ops-PH,...]         | [BUSBASIC]  | [Xero,Canva]       | [Ops-Sync]
```

#### 2. New Starter Wizard — `/admin/team-users/new-starter`
Multi-step form (kept alongside quick Invite):
1. **Personal:** First/last name, personal email, phone, AU/PH location, start date
2. **Role & Team:** Unicorn role, team leader (requesting manager), reports-to, job title
3. **Derived M365:** Auto-generated UPN (`firstname.lastname@vivacity.com.au`), display name, mail nickname, temp password — editable
4. **Preview:** Resolved checklist (groups/licenses/software from rules matrix), preview of team-leader email, preview of PowerShell scripts (mirrors your XLSM second tab — kept as fallback/audit even though we'll auto-execute)
5. **Provision:** Single button → triggers Graph API automation + creates checklist instance

#### 3. Graph API Auto-Provisioning Edge Function — `provision-m365-user`
App-only Graph token (admin consent flow). Performs:
- `POST /users` — create the M365 account (UPN, displayName, mailNickname, password, usageLocation)
- `POST /users/{id}/assignLicense` — assign each license SKU
- `POST /groups/{id}/members/$ref` — add to each M365 group
- Records `ms_user_id` in `user_microsoft_identities`
- Returns full transcript per step (success / fail / already-exists)

Each Graph step writes a row into the corresponding `lifecycle_checklist_instances` entry with `completed=true, completed_at=now(), notes='Auto-provisioned via Graph'` so the checklist stays the source of truth.

#### 4. Software/Calendar Steps — Manual + Trackable
Software accounts (ClickUp, Xero, Canva, etc.) and calendar invites can't be created via Graph. These remain checklist items the requesting admin ticks off, with helpful links per step (already supported by `external_link` column).

#### 5. Team Leader Email — Choice at Send Time
After provisioning succeeds, show a preview dialog with two send buttons:
- **Send via Mailgun** (system relay) → existing `send-transactional-email`
- **Send from my Outlook** → existing `send-email-graph`

Email body includes: new user's name, UPN, temp password (one-time), assigned groups/licenses, software accounts pending setup, link to checklist.

#### 6. TeamUsers page integration
- New **"Add New Team Member"** primary button → opens wizard (Quick Invite remains as secondary action)
- New **"Setup Status"** column showing checklist progress (`5/12 steps complete`) with click-through to checklist detail
- Filter chip for "Setup In Progress"

### Required setup from you (one-time)
- **Microsoft Entra app registration** with admin consent for: `User.ReadWrite.All`, `Group.ReadWrite.All`, `Directory.ReadWrite.All`, `Organization.Read.All`
- Add 4 secrets: `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `M365_DEFAULT_USAGE_LOCATION` (AU)
- Confirm available license SKU names so seed data matches your tenant

### Files to create
- `supabase/migrations/...` — `staff_provisioning_rules` table, RLS, seeded AU/PH rules
- `supabase/functions/provision-m365-user/index.ts` — Graph orchestrator
- `supabase/functions/generate-staff-checklist/index.ts` — instance generator from rules + role + location
- `src/pages/admin/NewStarterWizard.tsx` — multi-step form
- `src/components/admin/team-users/StaffProvisioningPreview.tsx` — checklist + email + script preview
- `src/components/admin/team-users/TeamLeaderEmailDialog.tsx` — send-time choice
- `src/hooks/useStaffProvisioningRules.tsx`
- `src/lib/m365/scriptGenerator.ts` — PowerShell fallback (mirrors XLSM tab 2)

### Files to modify
- `src/pages/TeamUsers.tsx` — add "Add New Team Member" button + Setup Status column
- `src/App.tsx` — register `/admin/team-users/new-starter` route
- Code Tables Manager registry — register `staff_provisioning_rules` as a managed table

### Build order (suggested)
1. Migrations + rules matrix UI in Code Tables (you can fill it in while I build the rest)
2. New Starter Wizard with checklist preview (no Graph yet — manual mode)
3. Team Leader email with send-time choice
4. PowerShell script generator (audit fallback)
5. `provision-m365-user` edge function — wired only after you've added the Entra app + secrets

### One thing to confirm before we start
I couldn't open your XLSM in this read-only mode (file encoding). Once we switch to build mode I'll extract the checklist rows and PowerShell script template directly from it to seed the rules matrix and script generator faithfully — so no rules are guessed.

