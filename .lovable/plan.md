

## Fix Document Sync Audit: Scrollability + Simplified Numbers + Per-Package Queries

### Two Issues

1. **Not scrollable**: The `ScrollArea` with `max-h-[400px]` isn't working because it needs a fixed height, not max-height, and needs proper overflow setup.
2. **Wrong counts (1000-row limit)**: The bulk query for `document_instances` across all 63 packages hits Supabase's 1000-row default limit, truncating results silently.
3. **Too much info per row**: Show 3 simple numbers instead of expanding details.

### Changes

**`src/hooks/useDocumentSyncAudit.ts`** — Fix the 1000-row limit
- Replace the single bulk `document_instances` query (line 74-77) with **per-stage-instance queries** using `Promise.all`
- Each query fetches `document_id` for one `stageinstance_id` (~200 rows max, well under limit)
- Batch in groups of 10 to avoid overwhelming the API
- Remove the orphaned doc title lookup (no longer listing individual docs in the collapsed view)

**`src/components/stage/DocumentSyncAuditPanel.tsx`** — Fix scroll + simplify display
- Replace `ScrollArea` with a simple `div` using `max-h-[400px] overflow-y-auto` for reliable scrolling
- Simplify each row to show 3 numbers inline (no expand/collapse needed):
  - **Has**: total docs the tenant has in this package (`instanceDocCount`)
  - **Extra**: docs in tenant but not in template (`orphanedInstances.length`)  
  - **Missing**: docs in template but not in tenant (`missingDocs.length`)
- Remove the `Collapsible` expand/collapse — just show the 3 counts per row
- Keep the expand option but make it optional (click to see doc names if needed)

### UI Per Row (simplified)
```text
[Tenant Name · Package]    Has: 199  |  Extra: 4  |  Missing: 0    ✓
```

