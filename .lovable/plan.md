

## Lifecycle Checklists — Database-Driven Dropdowns

### Principle
Follow the existing `dd_` table pattern (id/code/label/description/is_active/sort_order with auto-increment sequence) for all categorical fields. No hardcoded enums.

### New Lookup Tables Required

**1. `dd_lifecycle_type`** — The type of checklist
- Seed: `client_onboarding`, `client_offboarding`, `staff_onboarding`, `staff_offboarding`

**2. `dd_lifecycle_responsible_role`** — Who is responsible for a step
- Seed: `super_admin`, `operations`, `csc`, `team_leader`

**3. `dd_lifecycle_category`** — Grouping category for steps
- Seed: `m365_groups`, `m365_licenses`, `software_logins`, `calendar_invitations`, `crm`, `training_portal`, `external_comms`, `staff_details`

All three tables follow the standard schema:
```text
id          integer PK (auto-increment sequence)
code        text NOT NULL UNIQUE
label       text NOT NULL
description text NULL
is_active   boolean NOT NULL DEFAULT true
sort_order  integer NOT NULL DEFAULT 0
```

### Updated Template Table Design

`lifecycle_checklist_templates` will reference these via `code` text fields (matching existing dd_ pattern — stores codes, not IDs):

| Column | Type | Notes |
|---|---|---|
| lifecycle_type | text | FK-like to dd_lifecycle_type.code |
| category | text | FK-like to dd_lifecycle_category.code |
| responsible_role | text nullable | FK-like to dd_lifecycle_responsible_role.code |

### What This Enables
- All three fields are manageable from the existing **Code Tables** admin page
- New lifecycle types, categories, or roles can be added without code changes
- The admin template manager will use hooks (like `useSuggestDropdowns`) to populate selectors dynamically
- Consistent with how `dd_work_types`, `dd_package_type`, `dd_note_tags` etc. already work

### Implementation Steps
1. **Migration**: Create `dd_lifecycle_type`, `dd_lifecycle_responsible_role`, `dd_lifecycle_category` with standard schema + RLS + sequences
2. **Seed data**: Insert initial rows for all three tables
3. **Migration**: Create `lifecycle_checklist_templates` and `lifecycle_checklist_instances` referencing codes from the dd_ tables
4. **Hooks**: Add the three new tables to dropdown fetching (extend `useSuggestDropdowns` or create `useLifecycleDropdowns`)
5. **Admin template manager**: Use dynamic selectors for type, category, and role fields
6. **Checklist execution UI**: Resolve codes to labels via the lookup tables

