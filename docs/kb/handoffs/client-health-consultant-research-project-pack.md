# Unicorn Client Health — Consultant Research Project Pack

> **Purpose:** a safe, plain-language context pack for Vivacity consultants and
> operational specialists using a shared ChatGPT Project to research and shape
> Unicorn's client-health, activity, triage, and intervention capabilities.
>
> **Prepared:** 2026-09-08
>
> **Status:** research and product-definition input only. This pack does not
> authorize implementation, production changes, client communications, or use
> of identifiable client data.

## 1. Recommended use

Create one shared ChatGPT Project named:

**Unicorn — Client Health Research**

Use exactly two research chats in the Project:

1. **AJ — Unicorn Client Health Research**
2. **Ezel — Unicorn Client Health Research**

AJ and Ezel each use their own chat for the complete research assignment. They
do not need to create workstream chats, daily summaries, shared working files,
or interim handoffs. The uploaded files and Project Instructions give both
chats the same starting context without mixing their conversations.

When both consultants have finished, each chat produces one final research
report. Carl provides those two reports to Codex in the Unicorn repository;
Codex compares them and creates the consolidated implementation handoff
Markdown file. Codex cannot automatically read external ChatGPT Project chats,
so the two final reports must be uploaded or pasted into the Codex task.

The most useful contributions from consultants are not technical designs. They
are the operating judgments the software team cannot infer safely from tables:

- what a successful client engagement looks like at each lifecycle stage;
- which warning signs matter, and which apparently worrying situations are
  actually normal;
- how expectations differ by service, package, regulatory pathway, client
  complexity, and time under management;
- who owns a commitment or blocker;
- which interventions are appropriate and useful;
- which alerts would create noise or encourage the wrong behaviour.

Do not upload client-identifiable notes, email bodies, meeting transcripts,
personal data, financial data, credentials, or production exports. Use
synthetic, deidentified, or irreversibly redacted examples only. Any future use
of real notes requires a separately approved privacy, retention, access, and
evaluation process.

## 2. What Unicorn is

Unicorn 2.0 is Vivacity's compliance management system. It is a React/TypeScript
single-page application backed by a hosted Supabase project. It supports both
internal Vivacity operations and client-facing workflows.

Relevant existing product surfaces include:

- a Triage Dashboard for portfolio attention and operational work;
- a main dashboard with portfolio health information;
- client activity and recent communications;
- tenant/client directory and tenant details;
- client stages, tasks, evidence, audits, packages, notes, time entries, and
  timeline events;
- consultant assignment and capacity management;
- Ask Viv, an AI assistant with staff and client modes.

Unicorn is multi-tenant. Client isolation, staff permissions, note access, and
resource-level authorization are hard requirements, not UI preferences.

## 3. The product problem

The goal is to help consultants answer four different questions without
collapsing them into one misleading number:

1. **Client activity:** What happened? Who initiated it? Was it a client
   interaction, consultant work, a mutual working session, or an automated
   system event?
2. **Client health:** Is the engagement likely to achieve its agreed client and
   service outcomes without avoidable escalation?
3. **Consultant attention:** Which clients or commitments deserve attention
   now, why, by when, and from whom?
4. **Intervention effectiveness:** What was recommended, what action was taken,
   and what happened later?

These are related but not interchangeable. A healthy client may need urgent
attention because a regulatory deadline is near. A distressed client may have
high activity because consultants are already doing remediation work. A quiet
client may be on plan, or may be disengaged. High consultant effort may reflect
a premium service, onboarding, complexity, or genuine distress.

The proposed product should therefore lead with dimensions, reasons, evidence,
freshness, and confidence. Whether an overall score should exist at all is an
open decision for the Vivacity team.

## 4. What exists today—and why it is not a trustworthy health model

Unicorn already has health-like dashboard views, stage-health snapshots,
attention ranking, risk/retention jobs, notes, timeline events, tasks, package
usage, and portfolio widgets. These are useful historical intent and operating
data, but the September 2026 read-only investigation found serious semantic and
coverage problems.

Key findings from that dated investigation were:

- The stage monitor treated task status ID `2` as completed even though the
  live dictionary defined `2` as Not Started and `5` as Completed.
- All 337,272 inspected stage-health snapshots had progress equal to zero,
  while most active-client stages were labelled critical.
- Risk and retention output tables were empty, and both nightly functions
  returned HTTP 500 in the observed 24-hour production log window.
- Missing inputs could be converted by defaults into apparently reassuring
  low/stable results instead of an explicit unknown state.
- Recent notes in the bounded sample were staff-authored. Their volume measured
  service effort or documentation intensity, not direct client engagement.
- 82.1% of recent timeline events were automated document-share events, so a
  raw event count would largely measure system behaviour.
- Stage staleness used stage-row timestamps rather than the richer activity
  record, so a client could have many recent interactions and still appear
  inactive.
- Ownership data has historically existed in more than one place and can drift.

These observations are a dated baseline, not permanent truth. They must be
regenerated before implementation. For consultant research, the important
conclusion is: **do not treat the current score, label, note count, event count,
or effort total as ground truth.**

The proposed replacement objects and workflows have not yet been implemented.
The current repository still contains the legacy `stage_health_snapshots`
consumers; the proposed versioned activity, health-signal, attention, and
intervention contracts remain a plan.

## 5. Proposed health dimensions for consultants to challenge

These are hypotheses, not approved definitions.

### 5.1 Compliance delivery and outcomes

Possible signals include validated milestones, correct stage progression,
accepted evidence, audit or assessment outcomes, major non-conformities,
remediation progress, rework, and closure.

Consultants should define what “on plan,” “watch,” and “at risk” mean for each
relevant service and lifecycle—not just in the abstract.

### 5.2 Commitment discipline

Possible signals include client-owned commitments met or overdue,
Vivacity-owned commitments met or overdue, blocker ownership, dependency age,
response time, resolution time, and repeated rescheduling.

Client and Vivacity responsibilities must remain separate. The system should
not penalise a client for a consultant-owned delay or conceal a client blocker
inside a blended task count.

### 5.3 Relationship and engagement

Possible signals include client-initiated responses, reciprocal communication,
attendance at working sessions, key-contact continuity, decision-maker
participation, and cadence gaps relative to the agreed service.

Internal notes alone do not prove client engagement. Low communication can be
normal during an intentionally quiet period.

### 5.4 Service capacity and execution

Possible signals include consultant effort relative to service expectations,
package burn variance, workload concentration, blocked work, dependency age,
rework, and after-hours or escalation effort.

High effort is context, not automatically a negative health signal. Unicorn's
current assignment model estimates consultant capacity from working hours,
client-allocation and buffer factors, package-tier demand, and an onboarding
multiplier. Consultants should assess whether those assumptions reflect real
delivery effort and where they fail.

### 5.5 Lifecycle and commercial risk

Possible signals include renewal proximity, scope mismatch, package exhaustion,
suspension or churn state, regulatory deadlines, and—only where authorized—
financial or arrears information.

Commercial sensitivity must be access-controlled separately. A near renewal is
an attention reason; it is not necessarily poor client health.

### 5.6 Data confidence

Every health view needs to say whether it has enough fresh, valid evidence.
Missing sources, failed jobs, stale data, future timestamps, unknown status
codes, identity mismatches, and weak source linkage should reduce confidence or
produce **unknown**, never “healthy.”

## 6. The expected unit of health

A tenant/client is not always the right unit. One client can hold multiple
service engagements or package instances at different stages, with different
commitments and outcomes.

The current proposal is:

- assess health primarily at **client × service engagement/package instance**;
- retain tenant-wide signals only when they genuinely apply to the whole
  relationship;
- produce any client-level rollup as a separately defined view;
- never average a healthy engagement and a distressed engagement into an
  unexplained middle score.

Consultants should challenge whether this reflects how they actually manage
clients, including bundled services, concurrent pathways, dormant work,
renewals, and transitions between services.

## 7. What the first useful release could look like

A conservative first release would be deterministic and explainable. It might
show:

- a portfolio queue ordered by specific attention reasons, deadlines, impact,
  ownership, and confidence;
- separate health dimensions rather than only one score;
- client participation, consultant effort, and system activity as separate
  activity categories;
- expected versus observed cadence for the relevant service/lifecycle;
- client-owned and Vivacity-owned commitments separately;
- source, freshness, trend, confidence, and “why” for every signal;
- an explicit unknown/unavailable state when evidence is insufficient;
- a consultant workflow to accept, modify, dismiss, or snooze a suggestion and
  explain why;
- follow-up dates and outcome observations so the team can learn which
  interventions are useful.

It would not automatically contact clients, create tasks, change stages,
escalate accounts, make compliance judgments, or rank consultant performance.

## 8. Potential role for AI and Ask Viv

The initial AI role is evidence extraction and assistance, not decision
authority. From approved and authorized material, AI could suggest structured:

- commitments, owners, and due dates;
- blockers and dependencies;
- progress or evidence milestones;
- unresolved questions and decisions;
- urgency or escalation indicators;
- relationship/cadence observations;
- citations, confidence, ambiguity, and abstention.

Authoritative totals, dates, task/stage state, package use, financial values,
permissions, scoring, and cohort comparisons should remain deterministic.

Any note-derived assertion shown to a user must have a currently authorized,
server-validated citation. AI must not follow instructions embedded in client
notes, generate arbitrary links, retrieve across clients, or take automatic
client-impacting action. A human review pilot and a labelled evaluation set are
required before note-derived signals influence health.

## 9. Research questions for the consultant group

### Outcomes and lifecycle

1. What positive outcomes define a successful engagement for each service,
   package, and lifecycle stage?
2. What adverse outcomes are we actually trying to predict or avoid?
3. Which are leading signals, and which are lagging outcome measures?
4. Over what time horizon does each signal become meaningful?
5. Which “bad-looking” scenarios are normal and should not trigger concern?

### Cadence and participation

6. What contact or working cadence is expected by package and lifecycle?
7. What counts as a meaningful reciprocal interaction?
8. How should cancellations, client silence, delegated contacts, or planned
   quiet periods be interpreted?
9. What constitutes a genuine engagement gap rather than missing data?

### Commitments, blockers, and ownership

10. How do consultants distinguish a client-owned commitment from a
    Vivacity-owned commitment?
11. What types of blocker matter, and when does age or severity warrant action?
12. How should shared dependencies and third-party/regulator delays be handled?
13. Who can correct ownership or due dates, and what needs an audit history?

### Triage and intervention

14. What should cause a client to appear in “today's attention”?
15. Which conditions are urgent even when overall health is good?
16. What information is required before a consultant can act?
17. Which suggested interventions are genuinely helpful for each condition?
18. What makes an alert noisy, unfair, duplicative, or too late?
19. When should a suggestion be snoozed, dismissed, or escalated?
20. What follow-up window makes sense for each intervention?

### Scoring and confidence

21. Do consultants want one overall score, dimensions only, or both?
22. Are any dimensions hard stops that should override an average?
23. What minimum evidence coverage should produce unknown rather than a score?
24. How should conflicting evidence be shown?
25. Which cohort comparisons are fair and operationally meaningful?

### Safe and ethical use

26. Which information should each consultant, team leader, executive, client,
    or AI assistant be allowed to see?
27. Which data is too sensitive or misleading to include?
28. What uses must be prohibited—for example, consultant appraisal,
    compensation, or automatic client escalation?
29. What would build or destroy trust in the system?

## 10. Research scope for both consultants

Each consultant should independently cover the whole problem from their own
domain and operational perspective:

1. health outcomes, dimensions, and lifecycle/package differences;
2. meaningful client, consultant, mutual, and system activity;
3. reason-specific attention and triage rules;
4. useful interventions and follow-up horizons;
5. realistic healthy, stalled, escalating, recovering, quiet-but-on-plan, and
   data-insufficient cases;
6. relevant external customer-success, professional-services, compliance, and
   case-management research;
7. pilot design, usefulness measures, false-alert burden, and adoption gates;
8. risks, exceptions, missing information, and decisions Carl must make.

AJ and Ezel may reach different conclusions. Independent judgment is useful;
their chats should not try to manufacture agreement.

## 11. Required final report from each consultant chat

Only one formal deliverable is required from each chat, produced when the
consultant says their research is complete:

1. **Executive summary**
2. **Key findings**
3. **Recommendations**
4. **Supporting evidence and direct links**
5. **Consultant observations from operational experience**
6. **Proposed health definitions by package/lifecycle/cohort**
7. **Proposed attention reasons and interventions**
8. **Data required and whether Unicorn captures it reliably today**
9. **Risks, exceptions, and unintended incentives**
10. **Alternatives considered**
11. **Decisions Carl needs to make**
12. **Outstanding questions and evidence gaps**
13. **Confidence by major conclusion: high / medium / low, with reason**

Research must distinguish:

- evidence already established in the supplied Unicorn sources;
- an external fact supported by a cited primary or authoritative source;
- consultant experience or opinion;
- an inference;
- a proposed product decision.

## 12. Paste into the ChatGPT Project instructions

```text
You are the research and product-definition partner for Vivacity's Unicorn
Client Health program. Your audience includes compliance consultants,
customer-success leaders, product, data, security, and engineering.

Treat the uploaded Unicorn Project Pack and source plans as the internal source
of truth, while respecting their dates and statuses. Clearly separate what
exists today, what was observed in a dated investigation, and what is only
proposed. Never present the current legacy health score as validated ground
truth.

Your main job is to help consultants turn domain knowledge and operational
experience into precise, testable product definitions. Ask for differences by
service, package, lifecycle, client complexity, and regulatory pathway. Keep
client activity, client health, consultant attention, and intervention
effectiveness separate. Keep client-owned and Vivacity-owned commitments or
blockers separate.

When researching externally, use current authoritative or primary sources,
provide direct links, state the publication date where relevant, and explain
whether the practice transfers to Vivacity. Do not copy generic SaaS health
score advice uncritically into a compliance and professional-services context.

For each recommendation, identify the business outcome, intended user,
required evidence, formula or decision rule where applicable, cohort,
freshness, missing-data behaviour, risks, prohibited interpretations, and how
we would validate it. Treat missing or unreliable data as unknown—not healthy.
Do not infer causal impact from an observational before/after change.

Do not recommend using client health to rank or compensate consultants. Do not
recommend autonomous client messaging, compliance judgments, stage/task
changes, escalations, or other client-impacting actions in the first release.
AI may assist with structured evidence extraction and drafting, but numerical
facts, permissions, scoring, and final operational decisions must remain
deterministic and human-controlled.

Protect confidentiality. Do not request or reproduce identifiable client data,
raw client notes, email bodies, meeting transcripts, credentials, or production
exports. Use synthetic, deidentified, or irreversibly redacted examples. Flag
any proposal that would require a new privacy, retention, authorization, or
production-data decision.

There will be exactly two research chats: one for AJ and one for Ezel. Help the
consultant investigate the complete research scope in the Project Pack inside
their own chat. Do not ask them to create additional workstream chats, daily
summaries, or interim Markdown files.

When the consultant says their research is complete, produce one comprehensive
final research report using the required final-report format in the Project
Pack. Mark every conclusion as established Unicorn evidence, external evidence,
consultant observation, inference, or proposal, and give a confidence level.
Do not imply that either consultant can approve a product decision on behalf of
Carl or the wider Vivacity team.
```

## 13. Files to add to the Project

Start with a small, curated source set. Uploading the entire repository would
add noise and expose material consultants do not need.

### Required

1. This Project Pack.
2. [Client Health, Client Activity, Consultant Triage, and Intervention
   Analytics Plan](../reference/client-health-activity-analytics-plan-2026-09-03.md)

### Recommended supporting context

3. [Tenant Operating Model, Directory Performance, ERP, and Ask Viv Data
   Architecture Plan](../reference/tenant-operating-model-data-architecture-plan-2026-09-02.md)
4. [RBAC v6 Authorization Implementation Plan](../reference/rbac-v6-authorization-implementation-plan-2026-09-01.md)
5. [Automatic Consultant Assignment — Audit
   Documentation](../../consultant-assignment-capacity.md)

### Add later, only if the research needs it

- a synthetic example-case pack;
- a glossary of services, packages, lifecycle stages, and regulatory pathways;
- approved workshop notes with no client-identifiable information;
- approved screenshots or wireframes with client data removed;
- a current decision log and metric catalogue.

Do not upload source code, `.env` files, credentials, production data exports,
or the full audit log for this consultant research purpose.

## 14. The two chat prompts

Create the two chats and paste the relevant prompt below as the first message.

### AJ — Unicorn Client Health Research

```text
You are working with AJ on the Unicorn Client Health research assignment.

Read the Project Pack and all uploaded source plans first. Then help AJ examine
the complete research scope in the pack using AJ's domain knowledge and
operational experience. Work through the questions conversationally; ask
focused follow-up questions when AJ's experience can clarify how clients,
packages, lifecycle stages, commitments, warning signs, or interventions work
in practice.

Research relevant external practices when useful and provide direct,
authoritative sources. Challenge generic SaaS assumptions that may not fit
regulated compliance and professional-services work. Test recommendations
against realistic exceptions and the known limitations of Unicorn's current
health data.

Do not create daily reports or additional workstream chats. Keep useful notes
within this chat. When AJ says the research is complete, produce one
comprehensive final research report using section 11 of the Project Pack. Make
the report self-contained so it can be given to Codex for consolidation with
Ezel's independent report.

Begin by briefly confirming your understanding, then ask AJ which part of the
client-health problem they have the strongest operational experience with.
```

### Ezel — Unicorn Client Health Research

```text
You are working with Ezel on the Unicorn Client Health research assignment.

Read the Project Pack and all uploaded source plans first. Then help Ezel
examine the complete research scope in the pack using Ezel's domain knowledge
and operational experience. Work through the questions conversationally; ask
focused follow-up questions when Ezel's experience can clarify how clients,
packages, lifecycle stages, commitments, warning signs, or interventions work
in practice.

Research relevant external practices when useful and provide direct,
authoritative sources. Challenge generic SaaS assumptions that may not fit
regulated compliance and professional-services work. Test recommendations
against realistic exceptions and the known limitations of Unicorn's current
health data.

Do not create daily reports or additional workstream chats. Keep useful notes
within this chat. When Ezel says the research is complete, produce one
comprehensive final research report using section 11 of the Project Pack. Make
the report self-contained so it can be given to Codex for consolidation with
AJ's independent report.

Begin by briefly confirming your understanding, then ask Ezel which part of
the client-health problem they have the strongest operational experience with.
```

### Final handoff to Codex

After both chats are complete, upload or paste AJ's and Ezel's final reports
into a Codex task in the Unicorn repository and ask:

```text
Consolidate AJ's and Ezel's completed client-health research reports into one
implementation-ready Markdown handoff. Reconcile overlap, preserve material
disagreements and attribution, separate evidence from proposals, identify the
decisions I need to make, and map the agreed recommendations back to the
existing Unicorn client-health plan. Do not change production code or data.
```

## 15. Decisions the project should ultimately produce

The research is ready to hand back to product and engineering when it produces:

- agreed positive and adverse outcomes by cohort;
- approved health dimensions and prohibited interpretations;
- a decision on dimensions-only versus an overall score;
- expected cadence definitions and intentionally quiet periods;
- commitment/blocker ownership rules;
- source-coverage and unknown-state thresholds;
- a reason-based attention taxonomy;
- a consultant-approved intervention library and follow-up horizons;
- a representative, safe reference-case set and annotation guide;
- pilot usefulness and false-alert thresholds;
- role/access recommendations for health, notes, sensitive commercial data,
  AI-derived themes, exports, and intervention history;
- a dated decision log listing owners, evidence, dissent, and open questions.

These outputs are inputs to implementation planning. They do not themselves
authorize code changes, database changes, AI processing of client records, or a
production rollout.

## 16. Canonical source precedence

If this pack conflicts with the detailed plans, use this order:

1. the latest explicitly approved Vivacity decision record;
2. the current implementation/source and freshly regenerated read-only
   evidence;
3. the detailed client-health plan;
4. the tenant operating-model and RBAC plans;
5. this consultant-friendly summary.

Always retain dates. An old production observation is evidence about that
moment, not proof of the current state.
