# Lovable Phase Registry

## Overview

The Phase Registry is the authoritative source for all phases (formerly "stages") within Unicorn 2.0. It defines reusable workflow phases that can be assigned to packages and tracked across client engagements.

## Database Table

**Table Name:** `documents_stages` (legacy name retained for backwards compatibility)

**TypeScript Alias:** `PhaseRegistry` (see `src/types/phase.ts`)

## Schema

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | `integer` | ✓ | Auto-generated primary key |
| `stage_key` | `string` | ✓ | Unique phase code (e.g., "TAS", "HC-PREP", "MEMBERSHIP-ONBOARD") |
| `title` | `string` | ✓ | Display name shown in UI |
| `short_name` | `string` | | Abbreviated name for compact displays |
| `description` | `string` | | Detailed phase description |
| `stage_type` | `string` | | Phase type: "delivery", "internal", "milestone", etc. |
| `frameworks` | `string[]` | | Supported compliance frameworks: "RTO2015", "RTO2025", "CRICOS", "GTO" |
| `covers_standards` | `string[]` | | Standards this phase addresses (e.g., "1.1", "2.2") |
| `requires_stage_keys` | `string[]` | | Dependencies - phase keys that must complete first |
| `is_certified` | `boolean` | | Whether phase has passed quality certification |
| `certified_notes` | `string` | | Notes from certification review |
| `is_reusable` | `boolean` | | Whether phase can be used across multiple packages |
| `is_archived` | `boolean` | | Soft delete flag |
| `status` | `string` | | Current status: "draft", "active", "deprecated" |
| `version_label` | `string` | | Version identifier (e.g., "v1.0", "v2.1") |
| `registry_code` | `string` | | Official registry code for compliance tracking |
| `effective_date` | `date` | | Date phase became/becomes effective |
| `deprecated_at` | `timestamp` | | When phase was deprecated (null if active) |
| `dashboard_visible` | `boolean` | | Whether to show on dashboards |
| `video_url` | `string` | | Training/explainer video URL |
| `ai_hint` | `string` | | Hints for AI-assisted workflows |
| `created_by` | `uuid` | | User who created the phase |
| `created_at` | `timestamp` | ✓ | Creation timestamp |
| `updated_at` | `timestamp` | ✓ | Last update timestamp |

## Phase Types

| Type | Description |
|------|-------------|
| `delivery` | Client-facing phases with documents and tasks |
| `internal` | Internal workflow phases (not visible to clients) |
| `milestone` | Checkpoint phases marking significant progress |
| `review` | Review/approval phases |

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

- **draft**: Phase is being developed, not available for use
- **active**: Phase is available for assignment to packages
- **deprecated**: Phase is being phased out, existing uses continue
- **archived**: Phase is hidden from all views

## Usage Examples

### Querying Active Phases

```typescript
const { data } = await supabase
  .from('documents_stages')
  .select('*')
  .eq('is_archived', false)
  .eq('status', 'active')
  .order('title');
```

### Finding Phases by Framework

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

All changes to the Phase Registry are logged in `audit_events` with:
- `entity`: "phase"
- `entity_id`: phase ID
- `action`: "create", "update", "archive", "certify"

## Related Tables

- `package_stages`: Links phases to packages with sort order
- `client_package_stages`: Tracks phase progress for clients
- `stage_documents`: Documents attached to phases
- `stage_tasks`: Task templates for phases
- `stage_versions`: Version history snapshots

## Governance

Per the [Phase Naming Conventions](./phase-naming-conventions.md):
- UI displays "Phase" terminology
- Database/code retains "stage" for backwards compatibility
- All new documentation uses "Phase" terminology
