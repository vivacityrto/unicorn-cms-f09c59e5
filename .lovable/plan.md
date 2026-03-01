

# Add `source_reference` Column to `v_tenant_merge_fields` View

## What Changes

A single database migration that drops and recreates the `v_tenant_merge_fields` view, adding one new column:

| Column | Example Value | Description |
|--------|--------------|-------------|
| `source_reference` | `tenants.website` | Fully qualified `table.column` reference showing where the value comes from |

For address-sourced fields, the reference will include the address type, e.g. `tenant_addresses.suburb (HO)`.

## Technical Detail

Each UNION ALL sub-query already has access to `f.source_table` and `f.source_column` from the `dd_fields` join. The new column is simply:

```text
f.source_table || '.' || f.source_column AS source_reference
```

For address fields, it will append the address type:

```text
f.source_table || '.' || f.source_column || ' (' || f.source_address_type || ')' AS source_reference
```

For the TGA snapshots sub-query (which extracts from JSONB), the reference will show: `tga_rto_snapshots.payload->registrations->0->endDate`.

## Existing columns preserved (no breaking changes)

`tenant_id`, `field_id`, `field_tag`, `field_name`, `field_type`, `value`, `source` -- all unchanged.

## Files affected

| File | Action |
|------|--------|
| Migration SQL | `DROP VIEW` + `CREATE VIEW` with added `source_reference` column |
| `src/integrations/supabase/types.ts` | Auto-updated by Supabase after migration |

No frontend code changes required unless you want to display `source_reference` somewhere in the UI (e.g. the Merge Field Tags Admin page tooltips). That can be done as a follow-up.
