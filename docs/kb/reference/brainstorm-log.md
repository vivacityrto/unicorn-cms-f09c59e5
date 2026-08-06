# Brainstorm Log

> **Last updated:** 2026-04-27 · **Review by:** 2026-07-27 (items don't expire, but check whether they've moved to decisions or lost relevance) · **Confidence:** n/a — raw thinking, not claims of fact.
>
> Raw thinking, half-baked ideas, and explorations. Separate from [05-product-decisions.md](05-product-decisions.md) so that file stays clean. Ideas here are **not** decisions.

---

## Format

Each entry:
- **Date** (use absolute dates — "Thursday" decays fast)
- **Topic**
- **Raw thinking / notes**
- **Outcome** — if it led somewhere, link to `05-product-decisions.md` or `06-decision-trail.md`

---

## Log

### [2026-04-27] — Lovable → KB information capture (experimental)

**Topic:** Whether Lovable users can surface intent / decisions back into the KB through their Lovable prompts — i.e., the prompt becomes the source for an audit-trail entry, brainstorm note, or ADR seed.

**Raw thinking:**
- Currently `handoffs/lovable-to-codebase.md` is purely KB-owner-side reconciliation. Carl watches `main`, reconciles drift after the fact.
- Aspiration is two-sided: the Lovable user generates a useful artifact (a one-line note, a brainstorm fragment, an ADR seed) alongside the code change, without extra ceremony.
- The natural input is the prompt itself — what did the Lovable user *intend* to build, and why?
- Open questions: how the prompt is captured (paste back into a Claude Project chat? scrape from Lovable history?), what the format is, who owns the parsing/promotion step.
- Carl is exploring this. Status: experimental, not yet a pattern.

**Outcome:** Parked. Revisit when there's a working approach. If it solidifies, may turn into an extension to `handoffs/lovable-to-codebase.md` and an associated ADR.

---

### [2026-04-27] — Audit-trail access for non-technical KB readers

**Topic:** Should external reviewers / consultants in the Non-technical KB reader seat (see `pinned/team-roles.md`) get read access to `unicorn-audit/`?

**Raw thinking:**
- `unicorn-audit/` is currently KB-owner-only (Carl). It's the narrative reconciliation log — drift, remix events, what was decided when something went sideways.
- Argument for opening read access: the audit trail is the most honest record of what's actually happened in the KB. A fresh-eyes reviewer benefits from seeing it.
- Argument against: it's raw and internal. Meant as Carl's working tool, not a polished surface.
- Status: parked. No external reviewer is concretely engaged right now, so this stays hypothetical.

**Outcome:** Parked. Revisit when an actual external reviewer is brought in and the question becomes concrete.

---

### [2026-04-23] — EOS audit report intake (unverified)

**Topic:** A document titled `eos-audit-report.md` (generated 2026-02-05, marked "Unicorn 2.0 EOS System (Vivacity-Only)") was shared into a Claude session. It claims a substantial EOS internal architecture that diverges from this KB on several material points. **None of it has been verified against the codebase.** Capturing here so the information isn't lost; verification is a future task.

**What the report claims that disagrees with this KB:**

- **`VIVACITY_TENANT_ID = 6372`** (in `useVivacityTeamUsers.tsx` and a `get_system_tenant_id()` function). KB says **319** in every file (`00-start-here.md`, `01-architecture.md`, `02-system-design.md`, `03-flow-patterns.md`, `05-product-decisions.md`, `06-decision-trail.md → ADR-003`, `10-glossary.md`, plus the project Custom Instructions). One of these is wrong — possibly the report is from the sibling Vivacity Supabase project (which the KB explicitly flags as having different conventions).
- RLS helpers named `is_vivacity_team_safe()`, `is_vivacity_team()`, `is_vivacity_member()`, `user_has_tenant_access()`, `get_system_tenant_id()` — KB names ours as `is_vivacity()`, `is_superadmin()`, `current_tenant()`. ADR-005 already calls out the renamed-from sibling-project versions.
- EOS edge functions named `vivacity-assistant` and `sync-l10-participants` — neither appears in the KB's edge function list.

**What the report claims that the KB doesn't currently capture (potentially additive, not contradictory):**

- **`eos_workspaces` table with `workspace_id` columns on most EOS tables.** Suggests a workspace layer between `tenant_id` and EOS data. Architecturally significant if real — would be a documented pattern only present in the EOS module.
- All EOS tables use the `eos_*` prefix (`eos_meetings`, `eos_rocks`, `eos_issues`, `eos_todos`, `eos_qc`, `eos_scorecard_*`, `eos_vto`, `eos_agenda_templates`, `eos_flight_plans`, `eos_health_snapshots`, `eos_alerts`).
- `eos_issue_status` enum values: Open, Discussing, In Review, Actioning, Escalated, Solved, Closed, Archived.
- `eos_rock_status` enum values: Not_Started, On_Track, At_Risk, Off_Track, Complete.
- `eos_meeting_type` enum: L10, Quarterly, Annual, Focus_Day, Custom, Same_Page.
- `eos_function_type` enum (for accountability chart): integrator, visionary, sales_marketing, operations, finance, people, custom.
- A 6-table Accountability Chart subsystem (`accountability_charts`, `accountability_chart_versions`, `accountability_functions`, `accountability_seats`, `accountability_seat_roles`, `accountability_seat_assignments`) with versioning, GWC tracking, succession planning.
- AI/audit subsystem: `ai_suggestions`, `audit_eos_events`, `audit_gwc_trends`, `audit_seat_health`, `audit_succession_events`, `audit_people_analyzer`, `people_analyzer_entries`, `seat_rebalancing_recommendations`.
- **OPENAI_API_KEY** is the configured secret for AI assistant features. Note: `05-product-decisions.md → Open Decisions` lists "LLM provider(s) + prompt ownership" as **High-urgency open**. If this report is from our codebase, that decision is partially answered.
- Permissive `WITH CHECK (true)` INSERT policies on accountability_* tables — the report flags as HIGH priority to fix.
- `is_complete` boolean on `eos_meetings` exists alongside the `meeting_status` enum — flagged as a minor inconsistency.

**Verification path:**

1. Single grep against the codebase: `grep -rn "VIVACITY_TENANT_ID\|319\|6372\|get_system_tenant_id\|is_vivacity_team" src/ supabase/`. Result decides which project the report describes.
2. If 319 wins → file the audit report with the sibling-project notes; nothing in this KB changes from this entry.
3. If 6372 wins → significant KB hygiene fix needed (every "319" reference, every helper function name, ADR-003) **before** the next major piece of work lands. Likely also worth converting most of the additive claims above into proper KB entries (EOS schema in `02-system-design.md`, OpenAI in `05-product-decisions.md`, the workspace layer somewhere).

**Verification completed: 2026-04-23**

Grep confirmed: `VIVACITY_TENANT_ID = 6372` in both `supabase/functions/invite-user/index.ts:24` and `src/hooks/useVivacityTeamUsers.tsx:24`. The `319` value belongs to the sibling Vivacity project only.

All KB files have been corrected to use `6372`.

**Additive claims from the report (now confirmed or resolved):**
- ✅ `eos_workspaces` table exists — confirmed in `src/integrations/supabase/types.ts` and `src/hooks/useEosHealthCheck.tsx`
- ✅ `workspace_id` columns on `eos_rocks`, `eos_issues`, `eos_meetings`, `eos_scorecard_entries` — confirmed in types.ts
- ✅ All EOS tables use `eos_` prefix — confirmed by hook code (`useEos.tsx`, etc.)
- ✅ `eos_rock_status` enum values: `Not_Started`, `On_Track`, `At_Risk`, `Off_Track`, `Complete` — confirmed in eos-audit-report.md
- ✅ Accountability Chart subsystem (6 tables: `accountability_charts`, versions, functions, seats, seat_roles, seat_assignments) — confirmed in types.ts
- ✅ `OPENAI_API_KEY` for `assistant-answer` function — confirmed; primary gateway is Lovable AI (`ai.gateway.lovable.dev`) with Gemini models
- RLS `is_vivacity_team_safe()` / `has_tenant_access_safe()` — the `00-security-helpers-reference.sql` confirms these exist as the canonical RLS helpers used in migrations. `sql-setup/02-tenant-functions.sql` provides the simpler `is_vivacity()`, `is_superadmin()`, `current_tenant()` wrappers for convenience. Edge functions use `is_vivacity_internal` column directly.

**Outcome:** Resolved. KB updated. See `05-product-decisions.md` for LLM provider resolution and `06-decision-trail.md` ADR-003 for tenant ID correction.

---

### [April 2026] — Two "Unicorn 2.0" codebases exist

**Topic:** A separate Vivacity Supabase project also carries the "Unicorn 2.0" name but has a different codebase.

**Raw thinking:**
- The sibling Vivacity project and this project share a name, brand, and conceptual architecture.
- They diverge in concrete implementation: function names (`is_vivacity_team_safe()` vs `is_vivacity()`), edge functions, modules (audits is much richer there), EOS (not in sibling project).
- This is worth clarifying with RJ: is this codebase the "real" Unicorn 2.0 going forward, or is it a fork/experiment?
- If it's the real one, should we port select features from the sibling project (AI audit report gen, pg_cron scheduled jobs)?
- If it's a branch, what's the merge plan?
- Either way: the sibling docs are valuable as a library of solved problems and decision rationale, even if the implementation details don't transfer 1:1.

**Outcome:** Flagged as an Open Decision in [05-product-decisions.md](05-product-decisions.md#open-decisions). Raise with RJ directly. The Claude Project docs treat *this* codebase as canonical and reference the sibling project by name where relevant.

---

### [April 2026] — EOS is the differentiator, not the audits

**Topic:** What's the product actually selling?

**Raw thinking:**
- Inherited narrative framed Unicorn 2.0 as a compliance-operations platform with audits as the centerpiece.
- This codebase tells a different story: EOS Level 10 is the biggest subtree by a mile (20+ pages, 12+ hooks, its own `useMeetingRealtime`). Audits is present but simpler.
- If EOS is the product lead, the story is "Vivacity runs RTOs on EOS — here's the software to do it." Audits become a supporting module for the compliance side of that service.
- If audits is the lead (per sibling project), EOS is a customer-facing add-on.
- The marketing framing affects prioritisation: next sprint work should probably strengthen whichever is lead.

**Outcome:** No decision yet. Worth raising in a Level 10 or Quarterly Conversation with RJ + Vivacity leadership.

---

### [April 2026] — Campaign engine: build vs. buy vs. defer

**Topic:** Keap's campaign builder is a big chunk of legacy functionality. What's the replacement?

**Raw thinking:**
- Build: own the full orchestrator; expensive; the old project's `send-automated-email` v63 pattern suggests real complexity lurks here.
- Buy: Mailchimp / Customer.io / ActiveCampaign with a Supabase sync. Less ownership, faster.
- Defer: ship subscription/membership first, see if campaign needs become concrete, then decide.
- The "implicit" path right now is defer — there's no campaign UI and no urgency in the recent git log.
- Risk of defer: Vivacity still needs to do broadcast sends somehow. Mailgun's native UI may bridge the gap.

**Outcome:** Open. Recommend deferring until subscription portal is shipped; revisit then.

---

### [April 2026] — Stripe webhook handling

**Topic:** Edge Function or n8n?

**Raw thinking:**
- Edge Function pros: in the same infra, same language (TS/Deno), uses Supabase service role. Con: cold starts on bursty traffic.
- n8n pros: visual workflow for non-devs to tweak; retries/queueing built-in. Con: extra hop, extra infra.
- If the rest of the automation is trending toward Awesomate anyway, maybe n8n/Awesomate is consistent.
- But Stripe webhook idempotency + signature verification is *easier* in a tight TS function than in an n8n branch.
- Lean: Edge Function for the webhook receiver (signature verify, idempotency, minimal work) → emit an event to a queue/table → n8n picks up for the business automation. Splits concerns.

**Outcome:** Open. Proposed split-handler approach is a starting point for discussion with RJ.

---

### [April 2026] — AI agents: are the six from the sibling project in scope?

**Topic:** Alex, Casey, Morgan, Jordan, Riley, Sam. Do we need them here?

**Raw thinking:**
- Sibling project has six named n8n AI agents. We have `ai-generate-suggestions` and nothing else.
- If Vivacity already runs those agents operationally, they should probably serve this platform too — that's where the user experience lives.
- But "port from n8n to Awesomate" is a sibling-project migration, not a port *into* Unicorn 2.0 per se.
- Open questions for RJ: what does each agent do, who uses them, are they exposed to end-users or just consultants, where's the data they act on?
- Minimum viable: document the six agents in this Claude Project before anything else, even if integration comes later. Otherwise it stays tribal knowledge.

**Outcome:** Open. Doc-first, integrate-later.

---

### [April 2026] — Client portal architecture

**Topic:** Is `/client/eos` a one-off or the start of a dedicated client surface?

**Raw thinking:**
- Currently one client-only route (`/client/eos`). Elsewhere, client access is via role-filtered views of admin routes (e.g. `/tenant/:id/documents` with RLS doing the lifting).
- Two paths:
  1. **Dedicated client surface** — `/client/*` routes that look and feel different from the admin app. Pro: cleaner UX for clients. Con: more to build and maintain.
  2. **Single app, role-aware** — one React app, rendering differs by role. Pro: less duplication. Con: easier to leak admin UX to clients.
- Lean: probably (1) long-term, but (2) is fine for MVP. The RLS foundation protects us either way.
- Decision should come with a UX pass — what does the client actually want to see?

**Outcome:** Open. Will bite us as more client-facing surfaces appear.

---

### [April 2026] — Testing strategy

**Topic:** We have zero tests. When does that start to hurt?

**Raw thinking:**
- Hot spots that *should* have tests: edge functions (they're the security boundary), RLS policies (they're the data boundary).
- Testing edge functions: deno test. Testing RLS: integration tests with known user contexts.
- Testing React components: probably not worth it for Lovable-scaffolded UI. Focus instead on the hooks (which have logic).
- Minimum viable test suite:
  - One integration test per edge function covering the happy path + two common error codes
  - One RLS test per mixed-access table (tenant user sees their own, doesn't see others', Vivacity staff sees all)
  - Hook-level tests for anything with non-trivial state (useMeetingRealtime, useEos, useAudits)
- Defer UI component tests indefinitely unless a regression pattern emerges.

**Outcome:** Open. Not urgent yet but should land before subscription portal goes live.

---

### [April 2026] — Lovable staging environments

**Topic:** Is there a staging Supabase project? A staging Lovable build?

**Raw thinking:**
- If there's just prod, every change is live-risk.
- Supabase makes staging easy — clone the project, apply migrations to staging first.
- Lovable may or may not support environment branching cleanly. Research needed.
- Minimum: separate Supabase project for staging, even if Lovable always deploys to one prod URL. Migrations go to staging → verify → prod.

**Outcome:** Open. Strong recommendation to set up before the next schema-affecting sprint.

---

### [April 2026] — Typing the database

**Topic:** Are we using `supabase gen types typescript`?

**Raw thinking:**
- Type casts appear frequently in recent commits ("Adjust type casts for Supabase calls"). Smell.
- Official flow: generate TS types from schema and check them into the repo.
- Would catch a lot of shape drift at the component level.
- Should be part of the migration workflow — run after any migration merge.

**Outcome:** Worth a spike. File path to check: `src/types/` — if there's no generated `supabase.ts` or `database.ts`, introduce one.

---

## Ideas parking lot (unstructured)

- Prometheus-style dashboards for EOS metric adherence over time (meta: scorecard about scorecard usage)
- Meeting transcription → AI-drafted Issue / To-Do extraction (use `ai-generate-suggestions` pattern)
- Template marketplace for V/TO and Accountability Charts across RTO client types
- Slack integration for EOS To-Do reminders
- Mobile-focused pages for on-site audit work (tablet mode from sibling project roadmap — port the concept?)
- Benchmark analytics across tenants (anonymised) — "your Scorecard adherence vs. peer RTOs"
