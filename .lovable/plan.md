Replace the single `stage_instances` query in `supabase/functions/run-stage-health-monitor/index.ts` with a pagination loop so all qualifying rows are retrieved across multiple 1,000-row pages.

**Technical detail:**
```text
Before: .range(0, 9999) capped at 10,000 rows
After:  while-loop with .range(page*1000, page*1000+999) until data.length < 1000
```

No other changes to the file or other files.