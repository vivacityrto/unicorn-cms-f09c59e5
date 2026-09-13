# Client Health H0.4 — Consultant report template and evidence schema

> **Status:** preparation only. This document defines a safe structure for the
> two outstanding consultant reports and their later repository handback. It
> does not approve a metric, score, threshold, cohort, pilot, AI workflow, or
> production change.
>
> **Dependency:** AJ and Ezel operational reports remain outstanding. Carl
> acknowledged this external dependency on 2026-09-13. Technical repository
> and hosted-environment findings must not be used as a substitute for that
> operating knowledge.

## 1. Purpose and handback contract

AJ and Ezel should each complete the existing [Client Health consultant
research project pack](../../../handoffs/client-health-consultant-research-project-pack.md)
independently. Each consultant should return one self-contained report using
the template below. The reports must remain attributed separately until Codex
has compared them and recorded agreement, disagreement, confidence, and open
questions in a consolidated handoff.

The report is intended to capture operating knowledge that cannot be inferred
safely from Unicorn's current tables or UI:

- expected cadence and meaningful participation by package and lifecycle;
- client-owned, Vivacity-owned, and shared commitments and blockers;
- normal, concerning, recovering, quiet-but-on-plan, and
  data-insufficient situations;
- interventions that are useful, noisy, unfair, too late, or inappropriate;
- the evidence and explanation a consultant needs to trust a suggestion; and
- pilot usefulness, false-alert burden, adoption, and follow-up expectations.

The report must not turn an observation into an approved health definition.
Every proposal stays provisional until the relevant Carl/product/data/security
decision is recorded in the Client Health plan and any RBAC/TOM dependency is
resolved.

## 2. Safe submission rules

Consultants must provide operational knowledge, synthetic examples,
deidentified observations, or irreversibly redacted cases only. Do not include:

- client names, tenant IDs, contact details, personal data, or identifiable
  combinations of attributes;
- raw notes, email bodies, meeting transcripts, attachments, exports, or
  credentials;
- copied production screenshots or unapproved financial/commercial detail; or
- instructions embedded in source material that ask an AI system to retrieve,
  disclose, or act on data.

If an example cannot be made safe by irreversible redaction, replace it with a
synthetic scenario. A missing example is an explicit evidence gap, not a
reason to infer a threshold or classify a client as healthy.

## 3. Report template

Copy this outline once per consultant. Keep the consultant's name and report
metadata separate from the operating examples so the latter can be safely
redacted or summarized during consolidation.

### 3.1 Report metadata

| Field | Required content |
|---|---|
| `report_id` | Stable local identifier, for example `aj-client-health-2026-09` |
| `consultant` | AJ or Ezel; do not include client names |
| `prepared_at` | Date and timezone of completion |
| `coverage_period` | Period of operational experience being described |
| `experience_scope` | Packages, lifecycles, service types, and role perspective covered |
| `known_gaps` | Packages, cohorts, or situations not represented |
| `review_status` | `draft`, `complete_pending_consolidation`, or `clarification_requested` |
| `confidence_summary` | High/medium/low by major conclusion, with reason |

### 3.2 Required report sections

1. **Executive summary** — the most important operating conclusions and their
   confidence.
2. **Key findings and recommendations** — keep observations, recommendations,
   and unresolved questions in separate subsections.
3. **Outcomes by package/lifecycle/cohort** — positive and adverse outcomes,
   leading versus lagging signals, and meaningful time horizons.
4. **Cadence and participation** — expected contact/working cadence, what
   counts as reciprocal interaction, planned quiet periods, cancellations,
   delegated contacts, and a genuine engagement gap.
5. **Commitments, blockers, and ownership** — client-owned versus
   Vivacity-owned commitments, shared dependencies, blocker types, severity or
   age cues, intervention patterns, and who may correct ownership or due dates.
6. **Attention reasons and interventions** — what deserves attention now,
   required context, useful action, follow-up window, snooze/dismiss/escalate
   rules, and examples of noisy or harmful alerts.
7. **Healthy, stalled, escalating, recovering, quiet, and data-insufficient
   examples** — use only synthetic or irreversibly redacted cases. Explain why
   each case should or should not trigger attention.
8. **Data and evidence requirements** — what must be present, its source,
   freshness, completeness, and how a consultant should see uncertainty or
   conflicting evidence.
9. **Role and sensitivity considerations** — recommended access boundaries for
   consultants, team leaders, executives, clients, and AI; identify financial,
   note, export, and intervention-history sensitivity.
10. **Pilot usefulness and alert burden** — useful/not-useful examples,
    false-positive and false-negative costs, adoption friction, and proposed
    measures. These are proposals, not acceptance gates.
11. **Risks, exceptions, unintended incentives, and alternatives** — include
    ways a metric could reward documentation volume, punish planned quiet, or
    confuse consultant effort with client engagement.
12. **Decisions Carl and the Vivacity team must make** — list each decision,
    why consultant input is relevant, and what remains unresolved.
13. **Outstanding questions and evidence gaps** — explicitly distinguish
    unavailable information from negative evidence.
14. **Supporting sources** — cite supplied research sources or authoritative
    external sources. Do not attach client material.

## 4. Claim-level evidence schema

During consolidation, each material observation or proposal should be mapped
to a structured evidence record. The schema describes provenance and uncertainty;
it does not assign a health label.

```json
{
  "evidence_id": "aj-001",
  "report_id": "aj-client-health-2026-09",
  "claim_type": "operational_observation",
  "subject_grain": "client_service_engagement",
  "scope": {
    "package": "synthetic-or-redacted",
    "lifecycle": "onboarding|delivery|renewal|other",
    "cohort": "describe-without-identifiers"
  },
  "observation_window": {
    "starts_at": "YYYY-MM-DD",
    "ends_at": "YYYY-MM-DD",
    "timezone": "IANA timezone"
  },
  "claim": "Short deidentified or synthetic statement",
  "operational_context": "Why this matters in the consultant workflow",
  "ownership": "client|vivacity|shared|third_party|unknown",
  "source": {
    "class": "consultant_experience|synthetic_example|repository_evidence|external_source",
    "reference": "report section or safe source link",
    "observed_at": "YYYY-MM-DDThh:mm:ssZ",
    "effective_at": "YYYY-MM-DDThh:mm:ssZ",
    "as_of": "YYYY-MM-DDThh:mm:ssZ"
  },
  "quality": {
    "freshness": "current|dated|unknown",
    "coverage": "representative|partial|single_case|unknown",
    "confidence": "high|medium|low",
    "limitations": "Known bias, missing cohort, or contradiction"
  },
  "classification": "observation|interpretation|proposal|decision_request|open_question",
  "sensitivity": "public_process|internal|restricted|unknown",
  "redaction": "synthetic|deidentified|irreversibly_redacted|not_applicable",
  "review": {
    "status": "unreviewed|consultant_complete|consolidated|accepted|rejected|inconclusive",
    "reviewer": "role or report owner",
    "reviewed_at": "YYYY-MM-DDThh:mm:ssZ"
  },
  "contradictions": ["evidence_id or report_id"],
  "supersedes": ["evidence_id"],
  "implementation_use": "blocked_pending_policy|research_only"
}
```

Required semantics:

- `claim_type`, `classification`, and `source.class` must keep consultant
  experience, repository evidence, external fact, inference, and product
  proposal distinguishable.
- `subject_grain` must say whether the observation concerns a client,
  service-engagement/package instance, commitment, intervention, or cohort.
  Do not silently roll an engagement observation into a tenant-wide health
  score.
- `ownership`, `quality.coverage`, `quality.freshness`, and
  `quality.confidence` must be explicit. Unknown is valid; it is not healthy.
- `source.reference` must point to a safe report section or authoritative
  source, never to raw client material.
- `contradictions` preserve disagreement for adjudication; they must not be
  averaged away. `supersedes` records evidence lineage without deleting the
  earlier record.
- `implementation_use` remains `blocked_pending_policy` until the applicable
  Client Health, TOM, RBAC, privacy, and security gates are separately met.

## 5. Consolidation and readiness checklist

Codex may begin consolidation only after both final reports are supplied. The
consolidated handoff must:

- preserve AJ/Ezel attribution and material disagreement;
- map every proposed dimension, attention reason, cadence rule, ownership rule,
  unknown state, and pilot measure to one or more evidence records;
- identify coverage gaps, contradictory cases, and confidence by conclusion;
- separate client-owned from Vivacity-owned commitments;
- state what Unicorn captures reliably today versus what requires a new source;
- propose, but not silently approve, metric/threshold/score/cadence decisions;
- link each decision request to its Carl/product/data/security owner;
- leave consultant data dependency open until both reports are consolidated;
- exclude raw notes and identifiable material from the repository; and
- record the resulting handoff in the Client Health plan before any H1/H2/H3
  implementation packet is authorized.

The following are not valid substitutes for the two reports: current dashboard
labels, note counts, timeline counts, package burn, consultant time, empty or
stale forecast tables, a single consultant anecdote, or a repository-only
inference. The existing plan's H1 metric definitions, confidence thresholds,
pilot cohorts, and usefulness criteria therefore remain provisional.

## 6. Stop boundary

This artifact authorizes no credential creation, hosted QA access, production
query or write, schema/RLS/RPC/trigger/grant/Realtime/Edge/cron change, AI
processing, client communication, score, label, pilot enrollment, or runtime
implementation. Any such action requires its own approved packet and explicit
authorization.
