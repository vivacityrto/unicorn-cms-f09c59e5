# Phase Naming Conventions for Unicorn 2.0

> **Governance Document** – All current and future packages must follow these conventions.

## Core Naming Rules

1. **Use "Phase"** as the primary sequencing term in all user-facing contexts
2. **Never expose** internal `stage` database fields to users
3. **Phase names** must describe regulatory or delivery purpose

## Phase Structure

Use letters for ordered compliance phases:

```
Phase A – Descriptive name
Phase B – Descriptive name
Phase C – Descriptive name
```

### Examples

| Phase Code | Name |
|------------|------|
| Phase A | Initial Assessment |
| Phase B | Documentation Review |
| Phase C | Compliance Validation |
| Phase D | Final Submission |

## Phase Grouping

Use **Phase Group** only when grouping multiple Phases together.

### Examples

| Group | Phases Included |
|-------|-----------------|
| Phase Group 1 – Readiness | Phase A, Phase B |
| Phase Group 2 – Operational Setup | Phase C, Phase D |
| Phase Group 3 – Audit Preparation | Phase E, Phase F |

> **Note:** Phase Groups are labels only, not workflow steps.

## Status Language

### Approved Status Labels

| Status | Usage |
|--------|-------|
| Phase Locked | Phase cannot be started (dependencies not met) |
| Phase Open | Phase is available to begin |
| Phase In Review | Phase work submitted, awaiting approval |
| Phase Complete | Phase finished and approved |

> **Do not introduce alternative terms.** These four statuses cover all workflow states.

## Cross-Package Consistency

All packages must use Phase language consistently:

| Package | Requirement |
|---------|-------------|
| KickStart | Uses Phase terminology |
| Health Check | Uses Phase terminology |
| Memberships | Uses Phase terminology |
| Accredited Course Builds | Uses Phase terminology |
| Custom Packages | Uses Phase terminology |

### Rules

- No package may reintroduce "Stage" terminology
- Phase codes remain stable across releases
- Internal `stage_id` fields are permitted in code/database only

## Enforcement

1. All new features and copy **must** follow these conventions
2. Flag deviations **before** implementation
3. Code reviewers should verify Phase terminology in UI strings
4. Database fields may use `stage` internally (not user-facing)

## Technical Mapping

| User-Facing Term | Internal Field |
|------------------|----------------|
| Phase | `stage`, `stage_id` |
| Phase Name | `stage_title`, `stage_name` |
| Phase Status | `stage_status` |
| Phase Group | `dashboard_group` |

---

*Last updated: 2026-01-13*
