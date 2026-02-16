

# Research Pipeline: Perplexity + Firecrawl Integration for Unicorn 2.0

## Overview

This plan adds a "Research" subsystem to Unicorn 2.0 that uses Perplexity (AI-powered search with citations) and Firecrawl (website scraping and extraction) to support compliance workflows. All outputs are treated as non-binding drafts requiring human review before any compliance action.

---

## Phase 1: Foundation (Ship First)

### 1A. Connect Perplexity and Firecrawl

Both connectors exist in your workspace but are not linked to this project. We will link them so that `PERPLEXITY_API_KEY` and `FIRECRAWL_API_KEY` are available as environment variables in edge functions.

### 1B. Database Schema -- Research Pipeline Tables

Three new tables form the core pipeline:

```text
+-------------------+       +---------------------+       +----------------------+
| research_jobs     | 1---N | research_sources    | 1---N | research_findings    |
|                   |       |                     |       |                      |
| id (uuid PK)     |       | id (uuid PK)        |       | id (uuid PK)         |
| tenant_id (nullable)|    | job_id (FK)          |       | job_id (FK)          |
| job_type (text)   |       | url (text)           |       | summary_md (text)    |
| status (text)     |       | title (text)         |       | citations_json       |
| created_by (uuid) |       | retrieved_at (ts)    |       | review_status (text) |
| created_at        |       | content_hash (text)  |       | reviewed_by (uuid)   |
| completed_at      |       | raw_markdown (text)  |       | reviewed_at (ts)     |
| input_json        |       | created_at           |       | review_reason (text) |
| output_json       |       +---------------------+       | created_at           |
+-------------------+                                      +----------------------+
```

**job_type values:** `ask_viv_webbacked`, `tenant_onboarding`, `template_review`, `regulator_watch`, `public_offering_snapshot`

**status values:** `pending`, `running`, `completed`, `failed`

**review_status values:** `draft`, `approved`, `rejected`

**RLS rules:**
- Tenant users can read jobs scoped to their `tenant_id`
- Vivacity Team (Super Admin, Team Leader, Team Member) can read all jobs
- Only Vivacity Team and Super Admin can set `review_status = approved`
- `created_by` uses `auth.uid()`

### 1C. Edge Functions

Two new edge functions:

**`research-scrape`** -- Calls Firecrawl to scrape URLs, stores results in `research_sources`
- Input: `job_id`, `urls[]`
- Stores markdown, content_hash, retrieved_at per URL
- Updates job status

**`research-answer`** -- Calls Perplexity to synthesise an answer with citations
- Input: `job_id`, `question`, optional `context_sources[]`
- Stores summary + citations in `research_findings`
- Sets `review_status = draft`
- Updates job status

Both functions:
- Validate auth via `getClaims()`
- Check `is_vivacity_internal` for access control
- Write audit trail to `research_jobs`
- Handle 429/402 errors gracefully

---

## Phase 2: Ask Viv "Web-backed" Mode

### 2A. Add Third Mode to Ask Viv

Extend `AskVivMode` from `'knowledge' | 'compliance'` to include `'web'`.

- **useAskViv.tsx**: Add `'web'` to `AskVivMode` type
- **AskVivModeSelector.tsx**: Add a third segment with a Globe icon labelled "Web-backed"
- **AskVivPanel.tsx**: Add `sendWebBackedMessage()` handler that:
  1. Creates a `research_job` with `job_type = 'ask_viv_webbacked'`
  2. If user pasted URLs, calls `research-scrape` first
  3. Calls `research-answer` with the question + scraped context
  4. Renders answer with citations list (clickable links) and `retrieved_at` timestamps
  5. Shows a "Save to internal notes" button that creates a tenant note linked to the `job_id`

### 2B. Citation Rendering

Each web-backed response displays:
- Confidence indicator (same pattern as compliance mode)
- Numbered citation links below the answer
- `retrieved_at` timestamp per source
- Freshness warning if source is older than 7 days

---

## Phase 3: Regulator Update Watch (SuperAdmin)

### 3A. Watchlist Table

```text
+-------------------------+
| regulator_watchlist     |
|                         |
| id (uuid PK)           |
| url (text)              |
| name (text)             |
| check_frequency (text)  |
| last_checked_at (ts)    |
| last_content_hash (text)|
| created_by (uuid)       |
| created_at              |
| is_active (boolean)     |
+-------------------------+
```

Pre-populated with ASQA, DEWR, CRICOS National Code page URLs.

### 3B. Scheduled Check Flow

A cron-triggered edge function (`regulator-watch-check`) runs weekly:
1. For each active watchlist entry, calls Firecrawl to scrape the URL
2. Compares `content_hash` with `last_content_hash`
3. If changed:
   - Creates a `research_job` with `job_type = 'regulator_watch'`
   - Calls Perplexity to summarise what changed
   - Creates a task for CSC review
   - Optionally creates a draft release note
4. Updates `last_checked_at` and `last_content_hash`

### 3C. SuperAdmin Dashboard Panel

"Regulator Updates" panel on the Executive Dashboard showing:
- Pending review count badge
- List of recent changes with source, date, and review status
- Link to full job detail view

---

## Phase 4: Enrich Tenant on Onboarding

### 4A. "Enrich Tenant" Button

Available on the tenant profile page (SuperAdmin only). Input fields: ABN, website domain, RTO code.

### 4B. Enrichment Flow

1. Creates `research_job` with `job_type = 'tenant_onboarding'`
2. Firecrawl scrapes whitelisted pages (About, Courses, Contact)
3. Perplexity summarises: delivery locations, offerings, staffing claims, public compliance statements, key contacts
4. Outputs stored as draft fields with "Needs review" tags
5. Audit log records who ran it, sources used, timestamps

---

## Phase 5: Public Offering Snapshot + Template Review

These follow the same pipeline pattern and can be built incrementally after Phases 1-4 are stable.

---

## Guardrails (Applied Across All Phases)

| Rule | Implementation |
|------|---------------|
| No auto-commit to compliance state | All outputs are `review_status = draft` |
| Citations required | Every web-backed answer includes `citations_json` |
| Freshness warnings | Show `retrieved_at`, warn after 7 days |
| Domain whitelist | Configurable per job type; default ASQA/DEWR/CRICOS |
| Rate limits | Per-tenant request limits in edge functions |
| Full audit trail | `research_jobs` + `research_sources` + `research_findings` |
| Human-in-the-loop | Approve/Reject with reason field, Vivacity Team only |

---

## Implementation Sequence

| Step | What | Effort |
|------|------|--------|
| 1 | Link Firecrawl + Perplexity connectors | Minutes |
| 2 | Create database tables + RLS policies | Small migration |
| 3 | Build `research-scrape` edge function | 1 edge function |
| 4 | Build `research-answer` edge function | 1 edge function |
| 5 | Ask Viv web-backed mode (UI + handler) | Frontend changes |
| 6 | SuperAdmin Research Jobs list page | New page |
| 7 | Regulator watchlist table + cron function | Migration + edge function |
| 8 | Regulator Updates dashboard panel | Frontend widget |
| 9 | Enrich Tenant button + flow | Frontend + edge function |

Steps 1-5 are the "quick wins" that deliver immediate value. Steps 6-9 build on the same pipeline.

---

## Technical Notes

- Perplexity connector uses `PERPLEXITY_API_KEY` via `Deno.env.get()` in edge functions -- no gateway needed
- Firecrawl connector uses `FIRECRAWL_API_KEY` via `Deno.env.get()` in edge functions -- no gateway needed
- Both edge functions use the existing CORS and auth patterns from `_shared/cors.ts` and `_shared/auth-helpers.ts`
- The `ai-orchestrator` is not used for research jobs; they have their own dedicated functions to keep concerns separate
- All new tables use UUIDs as primary keys per project conventions

