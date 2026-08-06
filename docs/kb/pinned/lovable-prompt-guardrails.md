# Lovable Prompt Guardrails

> **Last updated:** 01 July 2026 · **Reconsider by:** 01 January 2027 · **Confidence:** high

Apply the relevant guardrail blocks when writing any Lovable prompt. Include the quoted text verbatim — do not paraphrase.

---

## 1. Design guardrail — mandatory for every UI prompt

Include this block in every prompt that creates or modifies a page or component:

> **Design:** Apply the existing Unicorn design system — match the visual style, component patterns, and brand tokens already in the codebase (Purple `#7130A0`, Fuchsia `#ED1878`, Cyan `#23C0DD`, Purple-to-Fuchsia gradient for hero elements, Anton for titles, Binate for headings). Use existing shadcn/ui components and Tailwind patterns consistent with the rest of the app. Do not introduce new UI libraries or custom CSS that deviates from established patterns. Exercise your own design judgement to make this page user-friendly, visually polished, and consistent with the quality of existing pages like the Dashboard and Client pages. Do not expect specific HTML or layout instructions from this prompt.

**Why:** Prescribing HTML or layout in prompts produces brittle, inconsistent results. Lovable knows the codebase's component library and design patterns better than any prompt-level markup instruction. Describing the outcome and delegating the design produces higher-quality, more maintainable UI.

---

## 2. Data-fetch guardrail — mandatory for any Supabase fetch, React Query hook, useState, or pagination change

Full procedure in `pinned/CLAUDE.md → Before writing a Lovable prompt`. Summary:

1. **Blast-radius check** — identify every component that reads from the data this change touches (stat cards, filters, row counts, realtime handlers).
2. **Scope the prompt** — include an explicit "do not touch" list and a dependency note for every affected consumer.
3. **Post-pull verification** — confirm stat cards, row counts, filters, and realtime updates still work in the browser.

---

## 3. Production DB change guardrail — mandatory for any migration, FK constraint, RLS policy, trigger, enum, or data backfill

Full procedure in `handoffs/lovable-production-db-change.md`. Summary:

1. Prompt 1 — Audit (plan mode ON, read-only, no code)
2. Design decisions gate — answer every open question before proceeding
3. Prompt 2 — Implementation plan (plan mode ON, no code)
4. Prompts 3–N — Phased implementation (plan mode ON per phase; never combine structural changes with data fixes)
5. Final prompt — Verification and sign-off

---

## Guardrail selection reference

| Prompt type | Guardrails to apply |
|---|---|
| New page or component | 1 (Design) |
| Modifying an existing page | 1 (Design) |
| Any Supabase query, hook, or pagination change | 1 + 2 |
| Migration, constraint, RLS, trigger, enum, or backfill | 1 + 2 + 3 |
