# TGA Staged Sync Pipeline

## Overview

The TGA (Training.gov.au) sync pipeline now supports staged job processing for better observability and reliability.

## Database Schema

### Tables

- **tga_rto_import_jobs**: Tracks individual sync jobs per stage
  - `stage`: One of `rto_summary`, `contacts`, `addresses`, `delivery_sites`, `scope_quals`, `scope_units`, `scope_skills`, `scope_courses`
  - `status`: `queued`, `processing`, `completed`, `failed`
  - `attempts`, `max_attempts`: Retry tracking
  - `run_id`: Links to parent import run

- **tga_import_runs**: Parent record for a sync operation
  - `run_type`: `staged_sync` or `full_sync`
  - `status`: `running`, `completed`, `failed`

- **tga_import_audit**: Audit trail for all sync operations
  - `tenant_id`, `triggered_by`, `rto_code`
  - `action`, `status`, `rows_affected`
  - `metadata`: JSON with sync details

### Scope Tables

- `tga_scope_qualifications`
- `tga_scope_units`
- `tga_scope_skillsets`
- `tga_scope_courses`

## API Actions

### Start Staged Sync
```typescript
await supabase.functions.invoke('tga-sync', {
  body: {
    action: 'start-staged-sync',
    tenant_id: '329',
    rto_code: '91020',
  }
});
// Returns: { success: true, run_id: 'uuid', jobs_created: 8, stages: [...] }
```

### Get Sync Progress
```typescript
await supabase.functions.invoke('tga-sync', {
  body: {
    action: 'sync-progress',
    run_id: 'uuid',
  }
});
// Returns: { total_jobs: 8, completed: 6, failed: 0, queued: 2, stages: [...] }
```

### Direct Sync (existing)
```typescript
await supabase.functions.invoke('tga-sync', {
  body: {
    action: 'sync-client',
    client_id: 'uuid',
    rto_number: '91020',
    tenant_id: '329',
  }
});
```

## UI Changes

- "Delivery Locations" renamed to "Delivery Sites" throughout the application
- TGA tabs show counts and data from all scope tables
- Sync success shows detailed counts per category

## Running Locally

1. Ensure TGA credentials are set:
   ```bash
   supabase secrets set TGA_USERNAME=your_username TGA_PASSWORD=your_password
   ```

2. Deploy the function:
   ```bash
   supabase functions deploy tga-sync
   ```

3. Test connection:
   ```bash
   curl -X POST 'https://your-project.supabase.co/functions/v1/tga-sync' \
     -H 'Authorization: Bearer YOUR_TOKEN' \
     -H 'Content-Type: application/json' \
     -d '{"action": "test"}'
   ```

## Audit Logging

Every sync operation creates an audit record with:
- Who triggered it (`triggered_by`)
- When it ran (`created_at`)
- What was synced (`rto_code`, `action`)
- Counts and results (`rows_affected`, `metadata`)

Query audit history:
```sql
SELECT * FROM tga_import_audit
WHERE tenant_id = 329
ORDER BY created_at DESC
LIMIT 10;
```
