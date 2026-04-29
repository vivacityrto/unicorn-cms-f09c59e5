# Universal Question Guidance — Plan (revised)

Strictly additive: one new shared component, one type extension, one new lightweight `useAuditTemplateFramework` hook, in-place rewrite of the existing guidance blocks inside `QuestionCard.tsx`. **No migration. No edge functions. No schema or RLS changes.** RLS on `compliance_template_questions` is already in place (`compliance_questions_read` for any authenticated user with a row in `public.users`).

## Verifications baked in

| Check | Result |
|---|---|
| Required columns on `compliance_template_questions` (`clause`, `audit_statement`, `evidence_to_sight`, `corrective_action`, `unicorn_documents`, `response_set`, `flagged_responses`) | All present, queried via `information_schema` |
| `useAuditQuestions` already returns `unicorn_documents` | Yes — uses `select('*')` |
| `unicorn_documents` shape | Semicolon-delimited, e.g. `"NC.01-CRICOS-Marketing Information and Practice Policy; Q2.D1 Marketing Compliance Checklist"` |
| `question_context` is *not* a free-text context field | Confirmed — it is the phase enum (`auditor_assessment`, `client_discussion`, `closing_discussion`). The "Context" sub-block is dropped per your direction. |
| RLS on the master question table | Already enabled with a working read-for-authenticated policy. **No DDL.** |
| Discriminator for SRTO vs CRICOS taxonomies | `compliance_templates.framework` (values: `SRTO_2025_CHC`, `SRTO_2025_MOCK`, `CRICOS`, `RTO_CRICOS_CHC`, `DUE_DILIGENCE`) |
| Combined CHC clause format | CRICOS clauses in the combined template are explicitly prefixed `NC ` (e.g. `NC 1`, `NC 2.3`). SRTO clauses are bare `1.1`, `2.7`, etc. Clean signal — no ambiguity. |

## Quality Area mapping rule (final)

```ts
function qualityArea(framework: string, clause: string): string | null {
  // Due Diligence questions use scoping clauses (3P-1, Work-3, Scope-1) — no QA chip.
  if (framework === 'DUE_DILIGENCE') return null;

  // CRICOS-only template → always National Code 2018.
  if (framework === 'CRICOS') return cricosArea(clause);

  // Combined template → "NC " prefix means CRICOS, otherwise SRTO.
  if (framework === 'RTO_CRICOS_CHC') {
    return clause.startsWith('NC ')
      ? cricosArea(clause.slice(3))
      : srtoArea(clause);
  }

  // SRTO 2025 templates (CHC + Mock).
  return srtoArea(clause);
}
```

**SRTO 2025 areas** (from clause prefix `1.x` to `4.x`):
- 1.x → Training & Assessment
- 2.x → VET Student Support
- 3.x → VET Workforce
- 4.x → Governance

**National Code 2018 areas** (from clause prefix `1` to `11`, also matching `1.1`, `NC 4.3`, etc.):
- 1 → Marketing Information & Practices
- 2 → Recruitment of Overseas Students
- 3 → Formalisation of Enrolment
- 4 → Education Agents
- 5 → Younger Overseas Students
- 6 → Overseas Student Support Services
- 7 → Transfer Between Providers
- 8 → Visa Requirements (Progress, Attendance, Delivery)
- 9 → Deferring, Suspending or Cancelling Enrolment
- 10 → Complaints & Appeals
- 11 → Additional Registration Requirements

Anything that doesn't match (e.g. opening-meeting questions whose clause is `Agents` or `1`–`4` without a dot in DD context, closing-meeting clauses) returns `null` and renders no Quality Area chip — only the `Standard {clause}` chip. No fallback noise.

## What gets built

### 1. New component — `src/components/audit/workspace/QuestionGuidance.tsx`

Props: `{ question: TemplateQuestion; framework: string | null; variant?: 'interactive' | 'print'; defaultOpen?: { findingGuide?: boolean } }`.

Layout:

```text
[Standard 1.1]  [Training & Assessment]      ← chips

▼ Evidence to sight              (default expanded; cyan #23C0DD left-border accent)
   {evidence_to_sight}            (italic, muted)

ⓘ Finding guide                  (default collapsed; bg-amber-50 when expanded)
   {corrective_action}

📄 Unicorn documents              (rendered only when populated)
   • parsed item 1
   • parsed item 2
```

- Standard chip: `bg-[#7130A0]/10 text-[#44235F]`, brand-purple per spec.
- Quality Area chip: per the mapping above; omitted when `null`.
- Unicorn documents parser: `value.split(/;|,(?!\s*\d)/).map(s => s.trim()).filter(Boolean)`. Items render as plain `<li>` (Phase 2 will wire to the document library).
- Built on shadcn `Collapsible` so each block toggles independently and resets on remount.
- `variant='print'` opens every block, removes chevrons, no hover state — ready for the future FindingsTab/ReportTab wire-up (separate PR per your direction).
- If `evidence_to_sight`, `corrective_action`, `unicorn_documents` are all null AND `clause` is null → component returns `null` and the parent renders the `No standards mapping` badge.

### 2. New hook — `useAuditTemplateFramework(templateId)` in `src/hooks/useAuditWorkspace.ts`

Single-row read of `compliance_templates.framework` keyed by `template_id`. Cached via react-query with the audit template ID, so it's fetched once per audit. Returns `string | null`.

### 3. Type extension — `src/types/auditWorkspace.ts`

Add to `TemplateQuestion`:
```ts
unicorn_documents: string | null;
```
`corrective_action`, `evidence_to_sight`, `clause`, `audit_statement`, `response_set`, `flagged_responses` are already present. The phase-enum `question_context` stays unchanged.

### 4. `AuditFormTab.tsx`

Call `useAuditTemplateFramework(audit.template_id)` once at the top of the component. Pass `framework` down to every `<QuestionCard />`.

### 5. `QuestionCard.tsx` — replace bespoke guidance

- Add `framework: string | null` prop.
- **Lines 271–287** (current "Evidence to sight" expand/collapse) → removed; rendered by `<QuestionGuidance />`.
- **Lines 351–359** (current `isFlagged` "Finding guide" amber panel) → removed; same content now lives inside `<QuestionGuidance />`. When `ratingNeedsFinding` flips true, the parent passes `defaultOpen={{ findingGuide: true }}` so the colour-story link to the warning banner stays intact.
- **Lines 244–256** header — drop the small `font-mono clause | nc_map` line because the new chips replace it. `nc_map` is preserved as a tooltip on the Standard chip so no information is lost.
- **Empty-data fallback** — if `<QuestionGuidance />` would render nothing AND the question has no `clause`, render a small grey `No standards mapping` badge.

Everything else from the previous "Raise Finding + Accurate Progress" PR (Raise Finding button state machine, `animate-pulse-once`, in-card amber banner, AddFindingForm expansion, notes/rating ordering for each `question_context` phase) is untouched.

## Out of scope (per your instructions)

- FindingsTab and ReportTab wire-up (`variant='print'`) — component will be built ready for it; the wire-up is a separate scoped PR.
- Editing `compliance_template_questions`. No deep-linking of Unicorn document items.
- AI-assisted suggestions, SRTO 2025 pgvector load, etc.

## Files touched

- **New:** `src/components/audit/workspace/QuestionGuidance.tsx`
- **Edited:** `src/hooks/useAuditWorkspace.ts` (add `useAuditTemplateFramework`)
- **Edited:** `src/types/auditWorkspace.ts` (add `unicorn_documents` to `TemplateQuestion`)
- **Edited:** `src/components/audit/workspace/AuditFormTab.tsx` (fetch framework, pass down)
- **Edited:** `src/components/audit/workspace/QuestionCard.tsx` (accept `framework` prop, swap guidance blocks for `<QuestionGuidance />`, preserve auto-open on flagged state, add fallback badge)

## Acceptance check before declaring done

1. CHC question card shows `Standard 1.1` chip + `Training & Assessment` chip + expanded Evidence to sight + collapsed Finding guide.
2. CRICOS audit, clause `4.3` → chips read `Standard 4.3` + `Education Agents`.
3. Combined RTO+CRICOS audit, clause `NC 4.1` → chips read `Standard NC 4.1` + `Education Agents`. Same audit, clause `2.7` → `Standard 2.7` + `VET Student Support`.
4. Due Diligence audit, clause `3P-1` → only the Standard chip renders, no QA chip, no breakage.
5. Question with populated `unicorn_documents` renders a parsed bulleted list.
6. Empty `evidence_to_sight` → that section disappears (no empty box).
7. Flagging a response auto-opens the Finding guide collapsible.
8. Australian English in all new copy (recognise, behaviour, colour, organisation).

Reply **approve** to switch to Agent mode and build.
