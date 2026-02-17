

## Phase 6b: Externalise Lifecycle and Access Status Values to Code Tables

### Goal
Move the hardcoded `lifecycle_status` and `access_status` values out of CHECK constraints and application code into managed `dd_` code tables, consistent with the existing pattern used by `dd_document_categories`, `dd_fields`, `dd_status`, etc.

---

### What Changes

#### 1. Database: Create Two New Code Tables

**`dd_lifecycle_status`** — follows the existing `dd_` convention (id, label, value columns):

| id | label | value | seq | is_default |
|----|-------|-------|-----|------------|
| 1 | Active | active | 1 | true |
| 2 | Suspended | suspended | 2 | false |
| 3 | Closed | closed | 3 | false |
| 4 | Archived | archived | 4 | false |

**`dd_access_status`**:

| id | label | value | seq | is_default |
|----|-------|-------|-----|------------|
| 1 | Enabled | enabled | 1 | true |
| 2 | Disabled | disabled | 2 | false |

Both tables get:
- RLS enabled
- SELECT for all authenticated users
- Full CRUD for Super Admins only (matching `dd_document_categories` policy pattern)

#### 2. Database: Replace CHECK Constraints with FK References

- Drop `chk_lifecycle_status` and `chk_access_status` CHECK constraints from `tenants`.
- Add foreign key constraints referencing the `value` column in each code table (using a unique index on `value`).
- This allows SuperAdmins to add future statuses via the code tables UI without a migration.

#### 3. Edge Function: Load Valid Values from DB

Update `supabase/functions/tenant-lifecycle/index.ts`:
- Replace the hardcoded `VALID_TRANSITIONS` map and `ACTION_MAP` with values fetched from `dd_lifecycle_status` at runtime.
- The transition rules themselves remain hardcoded in the function (they encode business logic, not display values), but the function will validate that any target status exists in the code table before proceeding.

#### 4. Frontend: Fetch Labels from Code Tables

Update `src/pages/ManageTenants.tsx`:
- Fetch `dd_lifecycle_status` and `dd_access_status` on mount.
- Use fetched labels/values for filter dropdowns and badge rendering in `getLifecycleBadge()` instead of the hardcoded config map.
- The badge styling (colours, icons) will still be mapped by value in the frontend — only the labels and available filter options become dynamic.

Update `src/components/tenant/TenantLifecycleActions.tsx` and `CloseClientModal.tsx`:
- No structural changes needed — these components reference status values that come from the database. Labels in confirmation dialogs can optionally pull from the code table but this is low priority since they describe actions, not statuses.

---

### What Does NOT Change

- Transition rules (active to suspended, etc.) remain as business logic in the edge function — these are governance rules, not display data.
- RLS write-protection policies continue to reference the raw text values (they must work at the DB level without joins).
- Audit logging structure stays the same.
- Reporting views stay the same (they filter on raw values).

---

### Technical Detail

```text
Migration steps:
1. CREATE TABLE dd_lifecycle_status (id serial PK, label text, value text UNIQUE, seq int, is_default bool)
2. CREATE TABLE dd_access_status   (id serial PK, label text, value text UNIQUE, seq int, is_default bool)
3. INSERT seed rows
4. Enable RLS + policies (same pattern as dd_document_categories)
5. ALTER TABLE tenants DROP CONSTRAINT chk_lifecycle_status
6. ALTER TABLE tenants DROP CONSTRAINT chk_access_status
7. ALTER TABLE tenants ADD CONSTRAINT fk_lifecycle_status FOREIGN KEY (lifecycle_status) REFERENCES dd_lifecycle_status(value)
8. ALTER TABLE tenants ADD CONSTRAINT fk_access_status FOREIGN KEY (access_status) REFERENCES dd_access_status(value)
```

```text
Files to create/edit:
- NEW  supabase migration SQL (one migration file)
- EDIT supabase/functions/tenant-lifecycle/index.ts (validate target status against DB)
- EDIT src/pages/ManageTenants.tsx (fetch dd_ tables for filters/badges)
- EDIT src/integrations/supabase/types.ts (auto-updated after migration)
```

### Risks and Mitigations

- **Existing data**: All current `lifecycle_status` and `access_status` values already match the seed data, so FK constraints will apply cleanly.
- **RLS policies**: They use raw text comparisons (`lifecycle_status NOT IN ('closed','archived')`). These remain valid — FKs ensure only valid values exist, and the text matching still works.
- **Code table management**: These tables will automatically appear in the existing SuperAdmin code tables UI (if it discovers `dd_` prefixed tables), allowing future value additions without developer intervention.

