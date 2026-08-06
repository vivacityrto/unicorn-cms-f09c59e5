# AI Use Principles — Standards for RTOs 2025

> **Last updated:** 2026-05-29 · **Reconsider by:** 2026-08-29 · **Confidence:** high — derived directly from the Standards for RTOs 2025 (Outcome Standards F2025L00354; Compliance Requirements F2025L00355).
>
> Active guardrail. Applies to every AI-enabled feature in the Unicorn platform — document generation, the compliance assistant, scorecard analysis, and any future model-backed capability. AI output on regulatory interpretation is draft only — the approved policy suite and Vivacity consultant advice remain authoritative.

---

## Why this exists

Unicorn supports work for RTOs, CRICOS providers and GTOs operating under the Standards for RTOs 2025. When AI is used inside the platform, it touches the same quality and integrity obligations our clients are held to. These five principles keep AI use deliberate, accountable and compliant.

They are not aspirational. They map onto Unicorn's existing non-negotiables and add one net-new process gate: **any new AI capability must be checked against all five principles before it is approved in Plan mode.**

See also: `reference/ai-audit-stack.md` for the technical implementation of the current AI audit stack; `reference/dev-guardrails.md` for the regression prevention checklist that governs Lovable shipping.

---

## The Five Principles

### Principle 1 — Governance

**Statement:** AI use is supported by strong governance that ensures it does not undermine the quality or integrity of VET. AI is used in ways that protect the quality and integrity of VET through strong organisational governance, transparent processes and robust controls that ensure AI-enabled practices remain compliant and reliable.

**Most relevant Standards / Clauses:** Quality Area 4 — Governance (Standard 4.1); Compliance Requirements — Clause 9.

**What this means in Unicorn.** Standard 4.1 requires an organisation to operate with integrity and maintain accountability for the delivery of quality services. Every AI capability we build must sit under named ownership, a documented control, and a reviewable trail — not bolted on by whoever was closest to the keyboard. In practice this means AI features ship under the same governance spine as everything else: an approved plan, a defined owner, and an audit record for every privileged action the AI takes on a client's behalf. No AI feature goes live without a human-owned control around it. AI is an assistant to a governed process, never the process itself.

**How the current architecture satisfies this:**
- Every privileged AI action writes an `audit_log` row (service-role log insert in all AI edge functions).
- AI features are approved in Plan mode before prompting Lovable — see the mandatory gate at the end of this document.
- The AI Insights dashboard (`/admin/ai-insights`) provides an operational trail of all AI drafting activity across the platform.

---

### Principle 2 — Human oversight and accountability

**Statement:** Human oversight and accountability is maintained in all AI-supported activities, ensuring that decisions affecting students remain the responsibility of qualified trainers, assessors and staff. AI is used in ways that ensure qualified trainers, assessors and staff retain full responsibility for decisions, applying active human oversight and professional judgement to AI-supported activities.

**Most relevant Standards:** Quality Area 1 — Training and Assessment (Standard 1.4); Quality Area 3 — VET Workforce (Standards 3.2 and 3.3); Quality Area 4 — Governance (Standard 4.2).

**What this means in Unicorn.** A qualified person owns every decision, full stop. Standard 1.4 requires assessment judgements to be fair, appropriate and accurate — that judgement cannot be delegated to a model. Standards 3.2 and 3.3 require training and assessment to be delivered by credentialled people with current skills; AI can support their work but cannot stand in for the credential. Standard 4.2 requires roles and responsibilities to be clearly defined and understood, which means it must always be clear who is accountable for an AI-assisted output. Unicorn presents AI output as draft for a named human to review, accept or reject. We never auto-finalise a student-affecting decision, and the accountable staff member is always identifiable in the record.

**How the current architecture satisfies this:**
- All three AI audit tools (Finding Drafter, Evidence Analyser, Executive Summary Drafter) produce drafts only — no rating or text is written without explicit auditor action.
- The `record-finding-decision` and `record-executive-summary-decision` edge functions log every accept/edit/reject decision against the auditor's user ID.
- The Evidence Analyser's Accept / Override / Discard flow makes the accountable decision visible and reversible at each step.

---

### Principle 3 — Privacy, data protection and record keeping

**Statement:** AI systems and tools manage information securely and in accordance with existing privacy, data protection and record keeping obligations. AI is used lawfully and in accordance with privacy, security and data-handling obligations across all aspects of training delivery and support.

**Most relevant Standards / Clauses:** Quality Area 4 — Governance (Standards 4.1 and 4.3); Compliance Requirements — Clause 20.

**What this means in Unicorn.** The Compliance Requirements oblige an organisation to comply with all applicable laws, including that personal information is collected, used and disclosed in accordance with all applicable privacy laws, and that obligations under the Student Identifiers Act 2014 are met. Standard 4.3 requires risks to students, staff and the organisation to be identified and managed — and feeding client or student data into an AI system is exactly such a risk. In Unicorn this is enforced architecturally, not by policy alone: client data is reached only through `can_access_client(client_id)`, never by raw `client_id`; AI calls run inside Edge Functions that respect that scoping; no student PII or Student Identifier leaves a controlled, logged path; and we never paste API keys, secrets or client data into third-party chat surfaces. Multi-tenant isolation is absolute — one client's data is never cross-referenced into another's AI context.

**How the current architecture satisfies this:**
- `can_access_client(client_id)` RLS gate is enforced on every client-data read in all AI edge functions.
- `analyse-evidence` runs an explicit cross-tenant leakage check (defence-in-depth beyond RLS) — each document's `tenant_id` is verified against `audit.subject_tenant_id` before any content reaches the model.
- All AI processing runs inside Supabase Edge Functions; no raw data reaches the browser or an uncontrolled surface.
- API keys and secrets are referenced by name only; they are never pasted into conversation or committed to source.

---

### Principle 4 — Equity, inclusion, accessibility and wellbeing

**Statement:** AI use supports and enhances student equity, inclusivity, accessibility and wellbeing. AI supports and enhances equitable, inclusive and accessible learning experiences for all students, including those with diverse backgrounds, abilities, digital literacy levels and support needs.

**Most relevant Standards:** Quality Area 2 — VET Student Support (Standards 2.2, 2.3, 2.5 and 2.6).

> Note: cited as "2.2, 2.3, 2.5 and 2.6" rather than "2.2–2.6" because there is no Standard 2.4 in the instrument.

**What this means in Unicorn.** Standard 2.2 (advising students on the suitability of a product before enrolment), 2.3 (access to support services and staff), 2.5 (a learning environment that supports diversity) and 2.6 (identifying and supporting wellbeing needs) together set the expectation that AI must widen access, not narrow it. AI features in Unicorn are checked for bias and accessibility before release, must not disadvantage students with lower digital literacy or differing support needs, and never replace a human support pathway — a student or client can always reach a person. Where AI surfaces a wellbeing or support signal, it routes to a qualified staff member rather than acting on it.

**How the current architecture satisfies this:**
- AI audit tools operate on the auditor side of the platform, not directly on the student-facing side — the student support pathway remains human-delivered.
- No AI feature auto-enrols, auto-assesses, or auto-closes a student record. Every student-affecting output requires a staff action.
- Bias and accessibility checks are required at Plan mode approval — see the mandatory gate below.

---

### Principle 5 — Alignment with training product, industry and cohort needs

**Statement:** AI use aligns with training product requirements, industry expectations and the needs of the relevant student cohort. AI is used deliberately and with clear purpose, strengthening the quality, integrity and industry relevance of VET delivery across training, assessment and student cohort.

**Most relevant Standards:** Quality Area 1 — Training and Assessment (Standards 1.1, 1.2 and 1.3); Quality Area 2 — VET Student Support (Standard 2.2).

**What this means in Unicorn.** Standard 1.1 (training consistent with the training product), 1.2 (industry relevance informed by employer and community engagement) and 1.3 (an assessment system fit-for-purpose and consistent with the training product), together with Standard 2.2 (suitability for the student), mean AI must be applied for a clear, justified reason tied to the product and cohort — not deployed for its own sake. In Unicorn, every AI feature has a stated purpose linked to a real client or delivery need, generic AI content is tailored to the specific training product and cohort before it is used, and we do not let model output drift away from what the training product and industry actually require.

**How the current architecture satisfies this:**
- The SRTO Corpus RAG layer grounds all AI output in the actual Standards for RTOs 2025 documents (`outcome_standards`, `compliance_requirements`) — the model cannot drift to generic advice because the retrieval is clause-filtered and framework-scoped.
- `draft-finding` and `draft-executive-summary` both carry a banned-term guard and an overlong-quote guard to prevent generic or hallucinated content reaching the auditor.
- Framework routing in `draft-finding` ensures CRICOS audits retrieve from `NATIONAL_CODE_2018`, SRTO audits from `SRTO_2025`, and combined audits from both — never cross-contaminated.

---

## How these principles bind in the platform

These five principles map onto the existing Unicorn non-negotiables:

| Non-negotiable | Principles enforced |
|---|---|
| RLS on every table + `can_access_client()` for all client data | 1, 3 |
| AI and document generation only inside Edge Functions, never the browser | 1, 2, 3 |
| Every privileged AI action writes an `audit_log` row | 1, 2 |
| AI output is always draft for a named human reviewer | 2 |
| Purpose stated and tailoring required before any AI feature ships | 4, 5 |
| No student-affecting decision is auto-finalised | 2, 4 |
| Multi-tenant isolation — one client's data never enters another's AI context | 3 |

---

## Mandatory gate — new AI capabilities

Before any new AI capability is approved in Plan mode, it must be checked against all five principles. This check is documented in the Plan, not assumed.

**Checklist (run in Plan mode before writing any Lovable prompt):**

- [ ] **Principle 1 — Governance:** Is there a named owner? Is there a documented control? Will every privileged AI action write to `audit_log`?
- [ ] **Principle 2 — Human oversight:** Is the output draft-only? Is there a named human reviewer in the flow? Is every student-affecting decision gated on an explicit staff action?
- [ ] **Principle 3 — Privacy:** Does all data flow through `can_access_client()`? Is multi-tenant isolation enforced at the edge function level? Does any PII leave a controlled, logged path?
- [ ] **Principle 4 — Equity:** Has the feature been checked for bias and accessibility? Does a human support pathway remain available? Does the feature disadvantage any cohort with lower digital literacy or different support needs?
- [ ] **Principle 5 — Alignment:** Is there a stated purpose tied to a real training product or delivery need? Is generic AI content tailored to the specific product and cohort before use? Is the RAG layer framework-scoped to prevent content drift?

If any check cannot be answered yes, stop and resolve it before proceeding.
