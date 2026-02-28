
# Part 2: Checkpoint Phases -- Implementation Plan

## Overview

Introduces an optional Phase grouping layer above Stages within packages. Phases provide checkpoint-based workflow progression with configurable gating (hard/soft/none). All changes are behind a feature flag -- zero impact when disabled.

## Step 2A: Database Migration (Single Migration)

### New Tables

**1. `dd_phase_status`** (lookup table, matches `dd_status` pattern)

| Column | Type | Notes |
|--------|------|-------|
| code | bigint PK | Numeric code |
| value | text NOT NULL UNIQUE | Status key |
| description | text NOT NULL | Display label |
| seq | integer NOT NULL | Sort order |

Seed: 0/open, 1/in_progress, 2/completed, 3/on_hold, 4/completed_with_exceptions

**2. `phases`** (reusable templates, UUID PK)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| phase_key | text NOT NULL UNIQUE | e.g. "KS-ONBOARD" |
| title | text NOT NULL | Display name |
| description | text | Purpose |
| gate_type | text NOT NULL DEFAULT 'none' | 'hard', 'soft', 'none' |
| is_archived | boolean DEFAULT false | Soft delete |
| allow_parallel | boolean DEFAULT false | Can run alongside other phases |
| sort_order_default | integer DEFAULT 0 | Default ordering hint |
| created_by | uuid | References auth user |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |

**3. `phase_stages`** (template-level mapping: which stages belong to which phase per package)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| phase_id | uuid NOT NULL REFERENCES phases(id) | |
| package_id | bigint NOT NULL | References packages.import_id |
| stage_id | integer NOT NULL | References documents_stages.id |
| sort_order | integer DEFAULT 0 | Order within phase |
| is_required | boolean DEFAULT true | Must complete for phase completion |
| created_at | timestamptz DEFAULT now() | |
| UNIQUE(phase_id, package_id, stage_id) | | Prevents duplicates |

**4. `phase_instances`** (runtime per tenant package instance, UUID PK)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| phase_id | uuid NOT NULL REFERENCES phases(id) | |
| package_instance_id | bigint NOT NULL | References package_instances.id |
| status | text NOT NULL DEFAULT 'open' | Matches dd_phase_status.value |
| gate_type | text NOT NULL | Copied from phases at instantiation |
| sort_order | integer DEFAULT 0 | Order for this instance |
| notes | text | General notes |
| exception_reason | text | Required when completed_with_exceptions |
| proceed_reason | text | Required when soft-gate bypassed |
| started_at | timestamptz | When first stage begins |
| completed_at | timestamptz | When phase is closed |
| closed_by | uuid | Staff who closed it |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |
| UNIQUE(phase_id, package_instance_id) | | One instance per phase per package instance |

### Feature Flag

Add column `enable_checkpoint_phases boolean NOT NULL DEFAULT false` to the `app_settings` table (single-row config, row id=1).

### Views (both with `security_invoker = true`)

**`v_package_has_phases`**: Returns package_id, has_phases (boolean), phase_count -- determined by checking `phase_stages` rows.

**`v_phase_progress_summary`**: Returns package_instance_id, phase_id, phase_title, sort_order, gate_type, total_stages, completed_stages, required_stages, completed_required, status, is_passable (computed from stage_instances with status_id IN (2,3) for completed/skipped).

### RPCs (all SECURITY DEFINER with `SET search_path = public`)

**`fn_instantiate_phases_for_package_instance(p_package_instance_id bigint)`**
- Looks up package_id from package_instances
- Finds all distinct phases in phase_stages for that package
- Creates one phase_instance per phase (idempotent -- skips existing via ON CONFLICT DO NOTHING)
- Copies gate_type and sort_order_default from phases
- Logs audit event
- Only callable by Vivacity staff

**`fn_close_phase_instance(p_phase_instance_id uuid, p_status text, p_note text DEFAULT NULL, p_exception_reason text DEFAULT NULL)`**
- Validates p_status exists in dd_phase_status
- If 'completed': verifies all required stages are done (cross-referencing phase_stages.is_required with stage_instances)
- If 'completed_with_exceptions': requires p_exception_reason
- Sets completed_at, closed_by = auth.uid()
- Only Vivacity staff can call
- Logs audit event

**`fn_check_phase_gate(p_phase_instance_id uuid)`**
- Returns: is_passable boolean, gate_type text, missing_stages text[]
- Used by UI to determine lock/warning state

### RLS Policies

| Table | SELECT | INSERT/UPDATE/DELETE |
|-------|--------|---------------------|
| dd_phase_status | All authenticated | Vivacity staff only |
| phases | All authenticated | Vivacity staff only |
| phase_stages | All authenticated | Vivacity staff only |
| phase_instances | Vivacity staff OR tenant member (via package_instances.tenant_id joined to tenant_users.user_id) | Vivacity staff only |

### Audit Triggers

Attach `fn_log_audit` trigger to `phases`, `phase_stages`, and `phase_instances` tables (same pattern as existing tables). Since all new tables use UUID PKs, they match the `audit_events.entity_id` UUID type cleanly.

### Rollback SQL (included as comment in migration)

```text
DROP VIEW IF EXISTS v_phase_progress_summary;
DROP VIEW IF EXISTS v_package_has_phases;
DROP FUNCTION IF EXISTS fn_check_phase_gate;
DROP FUNCTION IF EXISTS fn_close_phase_instance;
DROP FUNCTION IF EXISTS fn_instantiate_phases_for_package_instance;
DROP TABLE IF EXISTS phase_instances;
DROP TABLE IF EXISTS phase_stages;
DROP TABLE IF EXISTS phases;
DROP TABLE IF EXISTS dd_phase_status;
ALTER TABLE app_settings DROP COLUMN IF EXISTS enable_checkpoint_phases;
```

## Step 2B: Frontend -- Feature Flag Hook + Types

### New hook: `src/hooks/useCheckpointPhasesEnabled.ts`
- Queries `app_settings` for `enable_checkpoint_phases`
- Returns `{ enabled: boolean, isLoading: boolean }`
- Follows the `useAddinFeatureFlags` query pattern with appropriate stale time

### New types: `src/types/checkpoint-phase.ts`
- TypeScript interfaces for Phase, PhaseStage, PhaseInstance, PhaseProgressSummary
- Mapped from Supabase generated types after migration

## Step 2C: Frontend -- Admin Phase Management

### Package Builder integration (feature-flagged)
- New "Phases" tab in `PackageBuilderEditor.tsx` (only visible when flag ON)
- Create/select phase definitions and assign stages to them
- Set gate_type per phase (hard/soft/none)
- Drag stages into phases with sort ordering
- Stages not assigned to any phase remain ungrouped (backward compatible)

### Phase definition management
- New component for creating/editing phase templates (title, phase_key, gate_type, allow_parallel)
- Reachable from Package Builder's Phases tab

## Step 2D: Frontend -- Runtime Phase Display

### PackageStagesManager (admin view)
- When package has phases (check `v_package_has_phases`): group stages under collapsible phase headers with progress bars
- Show phase status badge from phase_instances
- Hard-gated phases show lock icon; soft-gated show warning icon
- Phase closure actions (Vivacity staff only)
- When package has no phases: existing flat stage list, unchanged

### Client Portal
- When phases exist: stages grouped by phase with read-only status indicators
- When no phases: flat stage list, unchanged
- Clients cannot close phases

## What Does NOT Change

- Stage creation, editing, certification, versioning
- Stage dependencies (requires_stage_keys)
- Task management (staff tasks, client tasks)
- Document and email management
- Time tracking / consultation hours
- Executive dashboard views
- All existing API contracts and RPC signatures
- The `documents_stages`, `stage_instances`, `package_stages` table schemas
- Any existing RLS policies
- `dashboard_group` column on `package_stages` (left in place)
- Existing `phase_requirements` / `package_phase_requirements` tables (different purpose, coexist)

## Build Sequence

1. **Step 2A** -- Database migration (tables, views, RPCs, RLS, feature flag, audit triggers)
2. **Step 2B** -- Feature flag hook and TypeScript types
3. **Step 2C** -- Admin phase management UI (Package Builder Phases tab)
4. **Step 2D** -- Runtime phase display (PackageStagesManager grouping, client portal)

Each step will be presented for approval before execution. When flag is OFF, zero visual or behavioural changes anywhere.

## Technical Notes

- `audit_events.entity_id` is UUID -- all new tables use UUID PKs, so audit triggers work without casting
- `is_vivacity_team_safe(auth.uid())` is the established pattern for Vivacity staff checks in RLS and RPCs
- `tenant_users.user_id` (uuid) is the join column for tenant membership checks
- `package_instances.id` is bigint -- `phase_instances.package_instance_id` matches this type
- `documents_stages.id` is integer -- `phase_stages.stage_id` matches this type
- `package_stages.package_id` is bigint -- `phase_stages.package_id` matches this type
- The `app_settings` table has a single row (id=1) -- the feature flag is a new column on it
