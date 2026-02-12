# Automatic Consultant Assignment — Audit Documentation

**Version:** 1.0  
**Date:** 2026-02-12  
**System:** Unicorn 2.0  
**Scope:** Client creation flow — automatic and manual consultant assignment

---

## 1. Overview

When a new client (tenant) is created, the system can automatically assign a consultant based on capacity. The assignment is deterministic, auditable, and supports manual override.

## 2. Capacity Formula

### 2.1 Consultant Weekly Assignable Hours

Computed dynamically from each consultant's Team Profile:

```
work_days_per_week = count(selected_working_days)
daily_hours        = end_time - start_time
weekly_work_hours  = work_days_per_week × daily_hours
weekly_client_hours = weekly_work_hours × 0.80          (80% client allocation)
weekly_assignable_hours = weekly_client_hours × 0.90    (10% buffer)
```

**Example:** Mon–Fri, 09:00–17:00 → 5 × 8 × 0.80 × 0.90 = **28.8 hours/week**

This value is **never stored permanently** — it is calculated at assignment time from live profile data.

### 2.2 Membership Tier Weekly Required Hours

Static configuration stored in `membership_tier_capacity_config`:

| Tier     | weekly_required_hours | Package IDs           |
|----------|----------------------|-----------------------|
| Amethyst | 0.10                 | M-AM (1041)           |
| Gold     | 0.40                 | M-GC (1016), M-GR (1020) |
| Ruby     | 0.91                 | M-RC (8), M-RR (5)   |
| Sapphire | 1.55                 | M-SAC (1035), M-SAR (1033) |
| Diamond  | 2.32                 | M-DC (1028), M-DR (1027) |

### 2.3 Onboarding Multiplier

Based on weeks since `client_onboarded_at` (or `created_at` if not set):

| Period    | Multiplier |
|-----------|-----------|
| 0–4 weeks | 2.0×      |
| 5–8 weeks | 1.5×      |
| 9+ weeks  | 1.0×      |

### 2.4 Client Weekly Required

```
client_weekly_required = tier_weekly_required_hours × onboarding_multiplier
```

## 3. Ranking Logic

When assigning, the system evaluates all eligible consultants:

**Eligibility criteria:**
- `is_vivacity_internal = true`
- `disabled = false`
- `archived = false`
- `allocation_paused = false`
- `working_days` has at least one day selected

**For each eligible consultant:**
1. Calculate `weekly_assignable_hours` (formula §2.1)
2. Calculate `current_load` — sum of `client_weekly_required` for all active assigned tenants
3. Calculate `projected_remaining = weekly_assignable_hours - current_load - new_client_weekly_required`

**Ranking (deterministic, multi-tier):**
1. **Highest `projected_remaining`** — most available capacity
2. **Lowest active client count** — tie-breaker
3. **Fewest assignments in last 30 days** — further tie-breaker

If all candidates have `projected_remaining < 0`, the consultant with the **highest** (least negative) value is selected, and `over_capacity = true` is flagged.

## 4. Audit Trail

Every assignment creates a record in `consultant_assignment_audit_log`:

| Field | Description |
|-------|-------------|
| `tenant_id` | The client being assigned |
| `action` | `auto_assign` or `manual_override` |
| `selected_consultant_user_id` | Who was assigned |
| `previous_consultant_user_id` | Previous consultant (for overrides) |
| `candidate_snapshot` | Full JSONB array of all candidates evaluated |
| `new_client_weekly_required` | Calculated weekly load for this client |
| `onboarding_multiplier` | Applied multiplier at time of assignment |
| `selected_projected_remaining` | Remaining capacity after assignment |
| `over_capacity` | Whether the selected consultant exceeded capacity |
| `reason` | Required for manual overrides |
| `created_at` | Timestamp |
| `created_by` | User who triggered the action |

### Candidate Snapshot Structure

Each entry in the `candidate_snapshot` array contains:
```json
{
  "consultant_user_id": "uuid",
  "weekly_assignable_hours": 28.800,
  "consultant_current_load": 12.450,
  "projected_remaining": 15.950,
  "active_clients": 8,
  "recent_assignments": 2
}
```

## 5. Manual Override

Requirements:
- Must select a new consultant
- Must provide a written reason
- Audit log records `action = 'manual_override'`, the `reason`, and both `previous_consultant_user_id` and `selected_consultant_user_id`

**No silent reassignment is permitted.**

## 6. Safeguards

- Consultants with zero working days are excluded
- Archived users are excluded
- Users with `allocation_paused = true` are excluded
- All queries respect RLS and tenant isolation
- UUIDs are used for all user references
- Every action logs who, what, when, and why

## 7. Database Objects

| Object | Type | Purpose |
|--------|------|---------|
| `membership_tier_capacity_config` | Table | Static tier → hours mapping |
| `consultant_assignment_audit_log` | Table | Full audit trail |
| `tenants.assigned_consultant_user_id` | Column | Current assignment |
| `tenants.consultant_assignment_method` | Column | `auto` or `manual` |
| `tenants.client_onboarded_at` | Column | Onboarding date for multiplier |
| `users.allocation_paused` | Column | Pause flag for consultants |
| `auto_assign_consultant(bigint)` | Function | Core assignment logic |
| `rpc_auto_assign_consultant(bigint)` | RPC | Frontend-callable wrapper |
