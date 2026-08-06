# Feature Matrix — 2026-05-20

> **Reflects commit:** `<codebase>@b5dd5886` (2026-05-20)
> **Reconsider by:** 2026-08-20 — feature matrices decay fast as routes ship, move, or get content populated. Re-run before trusting for any planning decision older than ~3 months.
> **Confidence:** high for the two roles traversed; coverage gaps below.
>
> **Methodology:** Playwright traversal against production `https://unicorn-cms.au` on 2026-05-20 as two test accounts (see [`memory/qa_test_accounts`](../../) for the full standardized cohort):
> - `carl+rto-a-primary@complyhub.ai` — Test RTO A (id 7517), `relationship_role=primary_contact`
> - `carl+rto-b-academy-1@complyhub.ai` — Test RTO B (id 7546), `relationship_role=academy_user`
>
> Both tenants are `tenant_type=compliance_system`, both have `academy_access_enabled=true`. Each top-level navigable route was visited via `mcp__playwright__browser_navigate` and the accessibility-tree snapshot recorded. Modal-only / drawer-only / per-record detail surfaces are NOT covered.

---

## Status key

| Symbol | Meaning |
|---|---|
| ✅ | Functional with real data or real wiring |
| 🟡 | Functional shell — structure works, awaiting per-tenant config |
| 🟠 | Stub — explicit "coming soon" copy, no functional surface yet |
| ⚪ | Empty content — page renders cleanly but no data populated |

---

## Primary contact view (`relationship_role=primary_contact`, layout: `ClientLayout`)

15 routes accessible from sidebar + topbar dropdown.

| Route | Status | Detail |
|---|---|---|
| `/client/home` | ✅ | CSC card (AJ Delostrico for Tenant A), package summary, "From Vivacity" cards (3× "Coming soon" — Upcoming events / Superhero Tools / Trainer PD), quick links, action cards. Phase banner top-right ("Setup Client / Not yet"). |
| `/client/inbox` | ✅ | 3 tabs: All / Messages / Notifications. Existing test messages present on Tenant A. |
| `/client/inbox?tab=notifications` | ✅ | Same component as `/client/inbox`, Notifications tab pre-selected. |
| `/client/tasks` | ✅ | 81 real tasks tied to KS-CRI package (Jun 2026 – May 2027 due dates). Tabs: All / Overdue / Due Soon / Completed. Show-archived toggle. **⚠ 1 console error on page load even with valid tenant data — worth a separate look.** |
| `/client/packages` | ✅ | Tenant A's "Kickstart CRICOS RTO Package" (12-stage journey, 2:30/40:00 hours, package_instance_id=15193). "Package history (1)" collapsible. |
| `/client/documents` | ✅ | 4 tabs: Shared with you / Uploaded by you / Requests / Governance Register. Upload button enabled, Request a document button disabled (likely until tenant unlocks the feature). Empty for test tenant. |
| `/client/files` | 🟡 | "No folder has been configured yet. Contact your Vivacity consultant for access." Google Drive-style integration needing per-tenant config. |
| `/client/resource-hub` | 🟠 | "Resource Hub is coming soon — templates, checklists, registers, audit tools, how-to guides." Request a Resource button surfaces twice. |
| `/client/calendar` | ✅ | Tabs: Events / My Reminders. Structure present, empty for test tenant. |
| `/client/reports` | ⚪ | "Reports will be available here. Once your consultant releases an audit report, it will appear here." Structure but no data. |
| `/client/suggestions` | ✅ | New Suggestion button + table. Functional CRUD surface. |
| `/client/users` | ✅ | 4 active users (RTO A standardized cohort). Role column renders "Primary contact / Secondary contact / Academy only" cleanly. Invite user button. |
| `/client/staff-pdps` | ✅ | Filter combobox + currency-status toggle + filter combobox, table, "Export audit pack" button (disabled until data). Full PDP tracking surface. |
| `/client/tga` | 🟡 | Status indicator: "disconnected". TGA / Training.gov.au API integration needs per-tenant config. |
| `/client/profile` | ✅ | Editable form: First Name, Last Name, Email (read-only), Phone, Position Title; Organisation section; Notification Preferences; Save Changes button. (Shipped 2026-05-20 — see commit history.) |

### Help Center exposure — primary contact

Surfaces visible on EVERY primary-contact route. This is the baseline before the planned lockdown (which would restrict CSC/chatbot/support to primary + secondary contacts only):

- **Sidebar buttons** (bottom of ClientSidebar): Help, **Message CSC**, Support
- **Footer "Get Help" list** (ClientFooter): Ask the chatbot, **Message your CSC**, Contact support
- **Floating "Open Ask Viv"** chatbot button (FloatingChatbot) — bottom-right on every page
- **In-page action cards** on `/client/home`: Message CSC, Ask the Chatbot
- **Per-package** "Message CSC" button in `PackageActionRow`

---

## Academy user view (`relationship_role=academy_user`, layout: `AcademyLayout`)

12 routes accessible from sidebar Pathways / Learning / Account sections.

| Route | Status | Detail |
|---|---|---|
| `/academy` | ✅ | Dashboard: 25 Courses stat, 0 In Progress / 0 Certificates / 0 Events. 5 pathway entry cards. "My Courses" empty state + "Team Progress" placeholder. |
| `/academy/courses` | 🟠 | "You haven't enrolled in any courses yet. A course catalog is coming soon." The user-specific enrollment view; catalog itself is on the pathway pages. |
| `/academy/pdp` | ✅ | "Start your PDP cycle for 2026" — aligned to Standards for RTOs 2025. Real Start cycle CTA. |
| `/academy/certificates` | ✅ | Stat cards: Total / Active / Expiring Soon (all 0). Empty state "Complete an Academy course to earn your first certificate". |
| `/academy/events` | ✅ | **Embedded AddEvent calendar** ("Superhero Members") with real May 2026 events: Inside VET, Trainer's Edge, RTO Success Marketing, Compliance Lab, Superhero Tools Unleashed. Add to Calendar + Download PDF links. |
| `/academy/community` | 🟠 | "Community module coming soon. We're building out community discussions. Check back shortly." |
| `/academy/trainer` | ✅ | **10 real courses**: TAS Superhero (105 lessons), Assessment Validation Series (53), Stellar Trainers Matrix (48), Online Training Superhero 2022 (12), Education in Isolation (29), Crafting Stellar Assessment Tools (10), Job Trainer Masterclass (8), 1-Day Workshops 2026 — TAS and Outcome Standards (43), Superhero Tools Unleashed (16), Superhero Membership Induction (5). Filters by category (Trainer Pd, Compliance, Membership, Online Delivery, Professional Development), Start Course buttons. |
| `/academy/compliance-manager` | ✅ | **12 real courses** (1-Day Workshops 2026, Compliance Webinar Series 82-lesson, Navigating New Standards 2024 + 2025, CRICOS Workshop, CRICOS 2024 — Mastering Standards, RTO Compliance Workshop 2022 + Works, Superhero Tools Unleashed, KickStart Package, Vivacity Conference 2023, Superhero Membership Induction). **Plus** "Compliance Resources" section with 3 downloads: SRTO 2025 Quick Reference Checklist, ASQA Evidence Matrix Template, RTO Self-Assessment Workbook. |
| `/academy/governance-person` | ✅ | 10 courses, filter categories (Leadership 4 / Governance 3 / Marketing 2 / Membership 2 / RTO Startup 2). Plus "Governance Toolkit" section with 3 downloads. |
| `/academy/student-support-officer` | ⚪ | Pathway shell renders cleanly with description "Skills to support, engage and retain VET students" but **All (0) courses** — content not populated. Different from a stub: code is fine, data is missing. |
| `/academy/administration-assistant` | ✅ | 8 courses, 5 filter categories (Leadership 3 / Governance 2 / Marketing 2 / Membership 2 / Strategic Planning 2). |
| `/academy/profile` | ✅ | Same editable form as `/client/profile` (reuses `ClientProfilePage` via `AcademyProfileWrapper`). Shipped 2026-05-20 by Lovable in the academy-settings-replacement work. |

### Help Center exposure — academy user

**None of the in-app Help Center entry points are exposed on the academy layout.** Academy footer has only external links (`help.vivacity.com.au`, FAQs, Terms, Privacy, mailto Support). No sidebar Message CSC button, no FloatingChatbot, no in-page CSC action cards.

This narrows the planned Help Center lockdown's real scope: the only role that currently sees in-app Help Center entry points without being primary/secondary is **regular `user` role on the client portal layout** (not academy users, not Vivacity staff using their own layout).

---

## Cross-cutting observations

### Architectural pattern findings

1. **Two distinct layouts (ClientLayout vs AcademyLayout)** route the same user through completely different chrome based on URL prefix. Academy users on `/academy/*` get the academy layout; primary contacts who navigate to `/academy` also get the academy layout (with a "Compliance System" back-link in the topbar — present for compliance-system tenants with academy enabled, hidden for academy-only tenants).
2. **Course catalog is split across pathway pages**, not in `/academy/courses`. The 25 Courses dashboard stat doesn't sum cleanly to the sum across pathways (Trainer Hub 10 + Compliance Manager 12 + Governance 10 + SSO 0 + Admin 8 = 40), suggesting either course-sharing across pathways or a different counting basis.
3. **Phase banner ("Phase: Setup Client / Submission: Not yet")** on every client portal page comes from a per-tenant compliance phase state, not per-route. Both Test RTO A and Test RTO B are in this default phase.
4. **External legacy CRM link** ("Unicorn 1" → `unicorn-cms.com.au/clients/<tenant_id>`) is on every client portal page in the phase banner. Different domain (`.com.au` vs `.au`); legacy CRM, not part of this app.

### Specific issues worth flagging

- **`/client/tasks` console error on load** — present even with valid tenant data for the primary contact. Likely a benign warning surfaced as an error, but worth a separate diagnostic pass.
- **`/academy/student-support-officer` with 0 courses** — code path works, data not populated. Either the pathway is intentionally empty or the course-to-pathway mapping is missing for SSO.
- **`/client/files` and `/client/tga`** are 🟡-shells that both rely on per-tenant integration setup. Test RTO A has neither configured, so both pages show their "needs configuration" empty state.

### Recommended follow-ups

- Re-run this traversal against `secondary_contact` and `user` roles when accounts exist — expected to be subsets of the primary view with some user-management surfaces restricted, but worth verifying.
- Add a SuperAdmin / Vivacity staff traversal as a separate matrix (the `/superadmin/*` and `/manage-*` routes are entirely uncovered here).
- The three 🟠 stubs (`/academy/courses`, `/academy/community`, `/client/resource-hub`) are obvious "still under construction" candidates — useful baseline for any roadmap conversation.
- The 🟡 shells (`/client/files`, `/client/tga`) and the ⚪ empty content (`/client/reports`, `/academy/student-support-officer`) would become functional with their per-tenant config / content load — worth confirming whether they're meant to be wired before the next milestone.

---

## Out of scope for this matrix

- **Roles not tested**: `secondary_contact`, regular `user`, Vivacity team (Super Admin / Team Leader / Team Member).
- **Routes not tested**: `/superadmin/*` (all admin routes, including `AcademyTenantAccessPage`, AcademyBuilder, etc.), `/manage-*` (manage-tenants, manage-documents, manage-users, manage-invites), EOS routes, `/post-sign-in`, password-reset flow, modal-only surfaces.
- **Interactions not exercised**: clicking into individual records (no specific package, document, course, certificate, or user detail page was opened), modal dialogs (only their trigger buttons were noted), file uploads, course launches.
- **Network audit**: API endpoints called per page were not catalogued. Only the rendered UI was inspected.
- **Behaviour with `academy_access_enabled=false`**: both test tenants currently have it `true`, so the gated AcademyLayout empty-state path was not exercisable in this run.

---

## Cross-references

- [`module-status.md`](module-status.md) — feature-level "what's built / partial / not started" per module. This matrix is the per-route view that complements it.
- [`codebase-map.md`](codebase-map.md) — file paths for the routes and components surfaced here.
- [`messaging-pipeline.md`](messaging-pipeline.md) — context for the Help Center / Message CSC surfaces.
- [`unicorn-kb/pinned/kb-hygiene.md`](../pinned/kb-hygiene.md) — when this matrix should be flagged for refresh.
