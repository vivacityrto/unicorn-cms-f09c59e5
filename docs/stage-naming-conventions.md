# Stage & Phase Naming Conventions for Unicorn 2.0

> **Governance Document** – All current and future packages must follow these conventions.

## Terminology

| Term | Meaning | Example |
|------|---------|---------|
| **Stage** | Individual workflow step | "Documentation Review", "Compliance Validation" |
| **Phase** | Checkpoint grouping layer (optional, above Stages) | "Onboarding Phase", "Audit Preparation Phase" |

## Core Naming Rules

1. **Use "Stage"** for individual workflow steps in all user-facing contexts
2. **Use "Phase"** only for checkpoint groupings (when Checkpoint Phases feature is enabled)
3. **Never expose** internal database field names (e.g., `stage_id`, `phase_id`) to users
4. **Stage names** must describe regulatory or delivery purpose

## Stage Structure

Use descriptive names for stages:

```
Stage: Initial Assessment
Stage: Documentation Review
Stage: Compliance Validation
Stage: Final Submission
```

## Phase Grouping (Checkpoint Phases)

When the Checkpoint Phases feature is enabled, stages can be grouped into phases:

| Phase | Stages Included |
|-------|-----------------|
| Onboarding | Initial Assessment, Documentation Review |
| Operational Setup | Compliance Validation, Policy Development |
| Audit Preparation | Final Review, Submission |

> **Note:** Phases are checkpoint groupings. Individual workflow steps are always "Stages".

## Status Language

### Approved Status Labels (Stages)

| Status | Usage |
|--------|-------|
| Not Started | Stage has not begun |
| In Progress | Stage work is underway |
| Blocked | Stage cannot proceed (reason required) |
| Complete | Stage finished |
| Skipped | Stage not applicable (non-required only) |

### Approved Status Labels (Phases – when enabled)

| Status | Usage |
|--------|-------|
| Open | Phase is available |
| In Progress | At least one stage has started |
| Completed | All required stages done |
| On Hold | Advisory – work can continue |
| Completed with Exceptions | Closed with documented exceptions |

## Cross-Package Consistency

All packages must use Stage/Phase language consistently:

| Package | Requirement |
|---------|-------------|
| KickStart | Uses Stage terminology |
| Health Check | Uses Stage terminology |
| Memberships | Uses Stage terminology |
| Accredited Course Builds | Uses Stage terminology |
| Custom Packages | Uses Stage terminology |

### Rules

- No package may use "Phase" to mean an individual workflow step
- Stage codes remain stable across releases
- Internal `stage_id` fields are permitted in code/database only
- "Phase" is reserved for the Checkpoint Phases grouping feature

## Technical Mapping

| User-Facing Term | Internal Field |
|------------------|----------------|
| Stage | `stage`, `stage_id` |
| Stage Name | `stage_title`, `stage_name` |
| Stage Status | `stage_status` |
| Phase (grouping) | `phase`, `phase_id` (Checkpoint Phases feature) |

---

*Last updated: 2026-02-27*
