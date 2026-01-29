

# Streamlined document_instances Migration

## Overview

Migrate `unicorn1.document_instances` data to `public.document_instances` with essential columns only, excluding legacy tracing fields.

## Schema Changes

| Column | Current | Change |
|--------|---------|--------|
| `id` | uuid | Change to bigint |
| `isgenerated` | missing | Add (boolean) |
| `generationdate` | missing | Add (timestamp) |
| `tenant_id` | exists | Keep (resolved via joins) |
| `document` | - | Skip (legacy tracing) |
| `dateimported` | - | Skip (legacy tracing) |

## Implementation

### Step 1: Schema Alterations

```sql
-- Fix ID column (drop UUID, add bigint)
ALTER TABLE public.document_instances DROP CONSTRAINT document_instances_pkey;
ALTER TABLE public.document_instances DROP COLUMN id;
ALTER TABLE public.document_instances ADD COLUMN id bigint PRIMARY KEY;

-- Add required columns from unicorn1
ALTER TABLE public.document_instances ADD COLUMN isgenerated boolean DEFAULT false;
ALTER TABLE public.document_instances ADD COLUMN generationdate timestamp without time zone;
```

### Step 2: Data Migration

```sql
INSERT INTO public.document_instances (
  id,
  document_id,
  tenant_id,
  status,
  isgenerated,
  generationdate,
  stageinstance_id,
  created_at,
  updated_at
)
SELECT 
  u1.id::bigint,
  u1.document_id::bigint,
  pi.tenant_id,
  CASE WHEN u1.isgenerated THEN 'generated' ELSE 'pending' END,
  u1.isgenerated,
  u1.generationdate,
  u1.stageinstance_id::bigint,
  COALESCE(u1.dateimported, now()),
  COALESCE(u1.generationdate, u1.dateimported, now())
FROM unicorn1.document_instances u1
JOIN stage_instances si ON si.id = u1.stageinstance_id
JOIN package_instances pi ON pi.id = si.packageinstance_id;
```

### Step 3: Update TypeScript Types

Update `src/integrations/supabase/types.ts`:

```typescript
document_instances: {
  Row: {
    id: number                           // Changed from string
    document_id: number | null
    tenant_id: number | null
    status: string | null
    isgenerated: boolean | null          // Added
    generationdate: string | null        // Added
    stageinstance_id: number | null
    coments: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id: number                           // Changed from string
    // ... same pattern for new fields
  }
  Update: {
    id?: number                          // Changed from string
    // ... same pattern for new fields
  }
}
```

## Final Schema

| Column | Type | Source |
|--------|------|--------|
| `id` | bigint PK | unicorn1.id |
| `document_id` | bigint | unicorn1.document_id |
| `tenant_id` | bigint | Resolved via stage_instances -> package_instances |
| `status` | text | Derived from isgenerated |
| `isgenerated` | boolean | unicorn1.isgenerated |
| `generationdate` | timestamp | unicorn1.generationdate |
| `stageinstance_id` | bigint | unicorn1.stageinstance_id |
| `coments` | text | Existing |
| `created_at` | timestamptz | Mapped from dateimported |
| `updated_at` | timestamptz | Mapped from generationdate |

## Technical Notes

- Table currently empty (0 records) - safe to alter
- Expected records: ~106,146
- `tenant_id` retained for quick tenant-level queries without joins
- `created_at`/`updated_at` derived from legacy timestamps for audit trail

