# Product Decisions (Index)

> **Last updated:** 2026-04-30 · **Reconsider by:** 2026-07-30 · **Confidence:** high for recorded entries.
>
> One-line-per-decision index. For full rationale, alternatives, and
> supersession history, see [../reference/decision-trail.md](../reference/decision-trail.md).
>
> **Maintenance:** when a decision is made, add a row here AND a full ADR in
> `decision-trail.md`. When an Open Decision is resolved, move it to the
> decided log.

---

## Decided

> Format: `[ADR-NNN] [YYYY-MM-DD] [one-line summary] — full: reference/decision-trail.md#adr-NNN`

The legacy ADR-001 through ADR-010 records live in reference/decision-trail.md but were not migrated forward as one-liners — they'll be re-engaged here as they become relevant in real work. New decisions from this point forward are recorded as normal (one-line index entry here + full ADR in decision-trail.md).

- [ADR-011] [2026-04-27] Operating model — Lovable is the workflow; no peer review or sign-off gates — full: [reference/decision-trail.md#adr-011](../reference/decision-trail.md#adr-011)
- [ADR-012] [2026-04-28] Audit-entry authorship — devs author Lovable prod DB change sessions; Carl sole author for everything else — full: [reference/decision-trail.md#adr-012](../reference/decision-trail.md#adr-012)
- [ADR-013] [2026-05-15] Flagship surfaces — CSC workflow + Client Portal + Vivacity Academy; EOS reclassified as internal operating system — full: [reference/decision-trail.md#adr-013](../reference/decision-trail.md#adr-013)

---

## Open decisions

> Format: `[YYYY-MM-DD opened] [topic] [owner] — next step`
>
> **Rule:** open > 6 months with no movement → either delete or escalate.
> See `kb-hygiene.md → Pruning discipline`.

- [2026-04-30] **AI executive summary exemplars** [Angela / Sam] — `draft-executive-summary` system prompt contains `{{EXEMPLARS_PENDING}}`. Sam to supply 2–3 redacted historical executive summaries (one CRICOS/Combined, one CHC/Mock, one Due Diligence) so Angela can replace the placeholder. Without them, output voice is untuned. — next step: Sam delivers redacted examples; Angela pastes into the function and deploys.
- [2026-04-30] **Corpus population — SRTO 2025** [Angela] — `embed-srto-corpus` exists but no confirmation it has been run against the actual Standards PDFs. Until run, all AI audit tools operate with `corpus_empty = true` (lower quality, but still functional). — next step: Angela confirms run date or schedules the ingestion.
- [2026-04-30] **Corpus population — National Code 2018 / ESOS Act** [Angela] — National Code 2018, CRICOS Practice Guides, and ESOS Act 2000 PDFs need to be uploaded to `srto-source-documents` and `embed-srto-corpus` run against them before CRICOS audits get framework-specific context. — next step: Angela uploads PDFs and runs embed function.
- [2026-04-30] **Gemini 2.5 Pro vs Claude for audit voice** [Carl / Angela] — Lovable AI Gateway does not route Anthropic models. Audit AI stack uses Gemini 2.5 Pro. If voice fidelity against Vivacity's existing findings style is insufficient, an Anthropic key + direct API call is the swap path (gateway URL + model ID only). — next step: Angela/Sam run test drafts against real findings; Carl decides.
- [2026-05-11] **Canonical audit ledger — design approach** [Carl] — 15 domain-specific `*_audit_log` tables exist with inconsistent schemas; no workspace-wide view; no `audit_user_events` table. Three options scoped: central table, federated view, hybrid. Primary use case (ops visibility vs compliance export) not yet decided. — next step: Carl decides use case; see `codebase-state/audit-log-inventory.md` for full scoping doc and decision questions.
- [2026-05-12] **Function search_path hardening — P1-e-ii** [Carl / Dave] — 28 functions patched with `SET search_path = 'public'` on 12 May 2026 (tag: `audit-2026-05-12-p1e-mutable-search-path`). Dave recommends `SET search_path = ''` (empty string) as the gold standard — eliminates public-schema shadowing entirely, not just caller injection. Requires auditing all 28 function bodies for unqualified calls to `public` objects and prefixing them with `public.` before the search_path can safely be set to empty. Not yet actioned — `= 'public'` passes the Supabase linter and is safe for now. — next step: Carl/Dave schedule a P1-e-ii body-audit session; new functions must use `= ''` from this point forward (see `pinned/conventions.md → Function hardening`).
- [2026-07-31] **RBAC v6 — close route-guard/Stages/RLS gaps left by v5** [Carl] — Trying to grant AJ (CSC role) package/stage/academy-admin access surfaced that RBAC v5's permission tables (`role_permissions`/`usePermission`) don't gate routes at all — `ProtectedRoute`'s `requireSuperAdmin` flag bypasses them entirely for 47 routes, and Stages was never modeled as a feature. Full plan: `handoffs/rbac-v6-gate-closure-plan.md`. — next step: Carl decides priority/timing; Phase 0 (investigation) has not started.

---

## Retired / superseded

<!--
  ADRs marked superseded retain their entry in decision-trail.md. Reflect
  here only if relevant to current product shape.
-->
