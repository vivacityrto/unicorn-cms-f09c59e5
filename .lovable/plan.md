In `supabase/functions/_shared/ask-viv-fact-builder/data-retrieval.ts`:

1. Change the select on the `package_instances` query from `"id, package_id, is_complete, start_date, end_date, updated_at"` to `"id, package_id, is_complete, start_date, end_date, created_at"`.
2. In the subsequent mapping, change `updated_at: inst.updated_at` to `updated_at: inst.created_at`.

No other files modified.