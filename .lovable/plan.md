

# Code Tables Manager — Implementation Plan

## Overview

Build a Super Admin interface at `/admin/code-tables` to discover, browse, and manage all `dd_` prefixed lookup tables. This replaces manual database edits with a dynamic, auditable UI that adapts to any table shape.

---

## What Gets Built

### 1. Database Layer (Migration)

Three new RPC functions:

- **`list_code_tables()`** — Returns metadata (table name, row count, RLS status, column definitions) for every `dd_*` table in the public schema. Super Admin gated via `is_super_admin_safe()`.
- **`code_table_operation(p_table_name, p_operation, p_data, p_where_clause)`** — Generic CRUD RPC accepting `select`, `insert`, `update`, or `delete`. Validates the table name matches `dd_%` before executing dynamic SQL. Soft-deletes (sets `is_active = false`) when the column exists, otherwise hard-deletes.
- **`format_code_label(input_label text)`** and **`standardize_code_value(input_label text)`** — Helper functions for auto-formatting label text and generating value slugs.

All functions use `SECURITY DEFINER` with `SET search_path = ''` and fully qualified `public.*` references. All are gated to Super Admin only.

### 2. Service Layer

**New file: `src/services/codeTablesService.ts`**

Thin wrapper around the RPCs providing typed methods: `getCodeTables()`, `getTableData()`, `createRow()`, `updateRow()`, `deleteRow()`, `formatLabel()`, `generateValue()`.

### 3. Hook Layer

**New file: `src/hooks/useCodeTables.ts`**

Two hooks:
- `useCodeTables()` — Fetches all table metadata. Returns `{ tables, loading, error, refetch }`.
- `useTableData(tableName)` — Fetches rows for the selected table. Returns `{ data, loading, error, refetch, createRow, updateRow, deleteRow }`. Mutations show toast notifications and auto-refetch.

### 4. UI Components (4 files)

| File | Purpose |
|------|---------|
| `src/pages/CodeTablesAdmin.tsx` | Page component — layout, dialog state, wires hooks |
| `src/components/admin/CodeTableSidebar.tsx` | Left panel — searchable list of dd_ tables with row counts and RLS indicators |
| `src/components/admin/CodeTableDataGrid.tsx` | Main area — dynamic table rendering with sort, search, action buttons |
| `src/components/admin/CodeRowDialog.tsx` | Create/Edit/Duplicate modal — dynamic form fields based on column metadata |

### 5. Routing

- Add route `/admin/code-tables` in `App.tsx` wrapped with `<ProtectedRoute requireSuperAdmin>`.
- Add navigation entry in `navigationConfig.ts` under the admin section.

---

## UI Behaviour

**Sidebar (left, w-80):**
- Search input filters table names
- Each table card shows: name, row count, RLS status (green shield = policies exist, amber = RLS on but no policies, red = no RLS)
- Selected table highlighted with `ring-2 ring-primary`

**Data Grid (main area):**
- Empty state when no table selected
- Header shows table name, security badge, row/column counts, search, "Add Row" button
- Columns generated dynamically from table metadata
- Booleans render as Active/Inactive badges
- Timestamps formatted as dates
- Actions column: Edit, Duplicate, Delete icons

**Row Dialog (modal):**
- Fields generated from column metadata
- `label` field auto-formats and auto-generates `value` on change (debounced 300ms)
- Booleans use Switch toggles
- `description` fields use Textarea
- Skips `id` on create/duplicate, skips `created_at`/`updated_at`/`created_by`/`updated_by`
- Validates required fields (non-nullable without defaults)

---

## Existing dd_ Tables (9 tables)

| Table | Key Columns |
|-------|-------------|
| dd_access_status | id, label, value, seq, is_default |
| dd_address_type | id, code, label, description |
| dd_document_categories | id, label, value |
| dd_fields | id, name, tag |
| dd_lifecycle_status | id, label, value, seq, is_default |
| dd_note_status | id, code, label, sort_order, is_active |
| dd_note_tags | id, code, label, description, is_active, sort_order |
| dd_note_types | id, code, label, sort_order, is_active |
| dd_status | code, description, seq, value |

All 9 tables already have RLS enabled with read (authenticated) and write (super admin) policies in place. No new RLS policies needed.

---

## Technical Details

**RPC Security Model:**
- All RPCs check `is_super_admin_safe(auth.uid())` before executing
- Dynamic SQL in `code_table_operation` validates table name against `information_schema.tables` with `LIKE 'dd\_%'` pattern before constructing queries
- Parameters are sanitised using `format()` with `%I` (identifier) and `%L` (literal) placeholders to prevent SQL injection

**Auto-format behaviour:**
- `format_code_label('health check status')` returns `Health Check Status`
- `standardize_code_value('Health Check Status')` returns `health_check_status`
- "and" is replaced with "&" in labels

**Soft delete logic:**
- If table has an `is_active` column, DELETE sets `is_active = false`
- Otherwise performs a hard DELETE

**Files created (6 new):**
1. `src/services/codeTablesService.ts`
2. `src/hooks/useCodeTables.ts`
3. `src/pages/CodeTablesAdmin.tsx`
4. `src/components/admin/CodeTableSidebar.tsx`
5. `src/components/admin/CodeTableDataGrid.tsx`
6. `src/components/admin/CodeRowDialog.tsx`

**Files modified (2):**
1. `src/App.tsx` — Add route
2. `src/config/navigationConfig.ts` — Add nav entry

**Database migration (1):**
- Creates `list_code_tables()`, `code_table_operation()`, `format_code_label()`, `standardize_code_value()` RPCs

