# Unicorn 2.0 Stage Registry

## Overview

The Stage Registry is the authoritative source for all stages (individual workflow steps) within Unicorn 2.0. It defines reusable workflow stages that can be assigned to packages and tracked across client engagements.

## Database Table

**Table Name:** `documents_stages` (legacy name retained for backwards compatibility)

**TypeScript Alias:** `StageRegistry` (see `src/types/stage-registry.ts`)

## Schema

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | `integer` | ✓ | Auto-generated primary key |
| `stage_key` | `string` | ✓ | Unique stage code (e.g., "TAS", "HC-PREP", "MEMBERSHIP-ONBOARD") |
| `title` | `string` | ✓ | Display name shown in UI |
| `short_name` | `string` | | Abbreviated name for compact displays |
| `description` | `string` | | Detailed stage description |
| `stage_type` | `string` | | Stage classification: "delivery", "internal", "milestone", etc. |
| `frameworks` | `string[]` | | Supported compliance frameworks: "RTO2015", "RTO2025", "CRICOS", "GTO" |
| `covers_standards` | `string[]` | | Standards this stage addresses (e.g., "1.1", "2.2") |
| `requires_stage_keys` | `string[]` | | Dependencies - stage keys that must complete first |
| `is_certified` | `boolean` | | Whether stage has passed quality certification |
| `certified_notes` | `string` | | Notes from certification review |
| `is_reusable` | `boolean` | | Whether stage can be used across multiple packages |
| `is_archived` | `boolean` | | Soft delete flag |
| `status` | `string` | | Current status: "draft", "active", "deprecated" |
| `version_label` | `string` | | Version identifier (e.g., "v1.0", "v2.1") |
| `registry_code` | `string` | | Official registry code for compliance tracking |
| `effective_date` | `date` | | Date stage became/becomes effective |
| `deprecated_at` | `timestamp` | | When stage was deprecated (null if active) |
| `dashboard_visible` | `boolean` | | Whether to show on dashboards |
| `video_url` | `string` | | Training/explainer video URL |
| `ai_hint` | `string` | | Hints for AI-assisted workflows |
| `created_by` | `uuid` | | User who created the stage |
| `created_at` | `timestamp` | ✓ | Creation timestamp |
| `updated_at` | `timestamp` | ✓ | Last update timestamp |

## Stage Classifications

| Type | Description |
|------|-------------|
| `delivery` | Client-facing stages with documents and tasks |
| `internal` | Internal workflow stages (not visible to clients) |
| `milestone` | Checkpoint stages marking significant progress |
| `review` | Review/approval stages |

## Frameworks

| Code | Description |
|------|-------------|
| `RTO2015` | Standards for RTOs 2015 (legacy) |
| `RTO2025` | Standards for RTOs 2025 (current) |
| `CRICOS` | CRICOS National Code |
| `GTO` | Group Training Organisation requirements |

## Status Lifecycle

```
draft → active → deprecated
         ↓
      archived
```

- **draft**: Stage is being developed, not available for use
- **active**: Stage is available for assignment to packages
- **deprecated**: Stage is being phased out, existing uses continue
- **archived**: Stage is hidden from all views

## Usage Examples

### Querying Active Stages

```typescript
const { data } = await supabase
  .from('documents_stages')
  .select('*')
  .eq('is_archived', false)
  .eq('status', 'active')
  .order('title');
```

### Finding Stages by Framework

```typescript
const { data } = await supabase
  .from('documents_stages')
  .select('*')
  .contains('frameworks', ['RTO2025'])
  .eq('is_certified', true);
```

### Checking Dependencies

```typescript
const { data } = await supabase
  .from('documents_stages')
  .select('stage_key, requires_stage_keys')
  .not('requires_stage_keys', 'is', null);
```

## Audit Trail

All changes to the Stage Registry are logged in `audit_events` with:
- `entity`: "stage"
- `entity_id`: stage ID
- `action`: "create", "update", "archive", "certify"

## Related Tables

- `package_stages`: Links stages to packages with sort order
- `client_package_stages`: Tracks stage progress for clients
- `stage_documents`: Documents attached to stages
- `stage_tasks`: Task templates for stages
- `stage_versions`: Version history snapshots

## Terminology

- **Stage** = individual workflow step (this registry)
- **Phase** = checkpoint grouping layer above stages (see Checkpoint Phases feature)

## Governance

Per the [Stage Naming Conventions](./stage-naming-conventions.md):
- UI displays "Stage" for individual workflow steps
- "Phase" is reserved for the new Checkpoint Phases grouping feature
- Database/code retains legacy `stage` field names for backwards compatibility
