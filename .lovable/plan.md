

# Import Selected Data from Unicorn 1 MSSQL Database

## What We Will Build

A SuperAdmin tool — a dedicated page or dialog — that lets you:

1. **Search** Unicorn 1 MSSQL by client ID or name
2. **Preview** the client's data (tenant details + instance records)
3. **Select** which data to import via checkboxes (tenant info, package instances, stage instances, document instances)
4. **Set the tenant ID** — the Unicorn 1 `id` becomes the `tenants.id` in Unicorn 2.0, so they match
5. **Execute** the import, inserting selected data into the correct public tables

## Prerequisites — MSSQL Connection Secrets

Four secrets need to be added to the project:
- `MSSQL_HOST` — server hostname/IP
- `MSSQL_DATABASE` — database name
- `MSSQL_USER` — SQL login username
- `MSSQL_PASSWORD` — SQL login password

## Changes

### 1. New Edge Function: `lookup-unicorn1-client`

Connects to MSSQL via `npm:tedious`, accepts `{ search: string }` (ID or name), returns matching clients from `users_clientlegals` with all fields (companyname, rto_id, rto_name, legal_name, abn, acn, cricos_id, email, phone, website, address, suburb, state_code, postcode, lms).

SuperAdmin-only (JWT validated in code).

### 2. New Edge Function: `import-unicorn1-client`

Accepts `{ client_id: number, import_options: { tenant: boolean, package_instances: boolean, stage_instances: boolean, document_instances: boolean } }`.

Connects to MSSQL, fetches selected data, and inserts into the public schema:

**Data mapping:**

| MSSQL Source | Target Table | Key Mapping |
|---|---|---|
| `users_clientlegals.id` | `tenants.id` | Direct — ID preserved |
| `users_clientlegals.*` | `tenants` fields | companyname→name, rto_name, legal_name, abn, acn, rto_id, cricos_id, website, lms |
| `package_instances` (where client_id = X) | `public.package_instances` | tenant_id = client_id, package_id, start_date, end_date, is_complete, clo_id |
| `stage_instances` (via package_instances) | `public.stage_instances` | stage_id, packageinstance_id, status, completion_date |
| `document_instances` (via stage_instances) | `public.document_instances` | document_id, stageinstance_id, is_generated, generation_date |

The edge function uses a service-role Supabase client for inserts, with conflict handling (skip if ID already exists).

### 3. New UI Component: `Unicorn1ImportDialog.tsx`

A dialog accessible from the client management area (e.g., button on the Manage Clients page). Flow:

1. Search field — type ID or name, results appear below
2. Select a client — shows a preview card with their details
3. Checkboxes for what to import:
   - Tenant details (always checked by default)
   - Package instances
   - Stage instances
   - Document instances
4. Confirmation showing the Unicorn 1 ID that will become the tenant ID
5. Import button — calls the edge function, shows progress/result
6. Success toast with link to the new tenant page

### 4. Config updates

- `supabase/config.toml` — register both new functions with `verify_jwt = false`

## Files

- **New**: `supabase/functions/lookup-unicorn1-client/index.ts`
- **New**: `supabase/functions/import-unicorn1-client/index.ts`
- **New**: `src/components/Unicorn1ImportDialog.tsx`
- **Edit**: `supabase/config.toml`
- **Edit**: Parent page to add the import button (e.g., client list page or AddTenantDialog)

