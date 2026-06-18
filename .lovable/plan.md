## Phase 2c — Set NOT NULL on compliance_obligations FK columns

### What
Upgrade `audience_id` and `recurrence_id` on `public.compliance_obligations` from nullable to NOT NULL. Phase 2b already verified zero null rows.

### Migration
```sql
ALTER TABLE public.compliance_obligations
  ALTER COLUMN audience_id   SET NOT NULL,
  ALTER COLUMN recurrence_id SET NOT NULL;
```

### Verification (post-run)
- `information_schema.columns.is_nullable` for both columns must return `NO`.
- `SELECT count(*) FROM public.v_client_reporting_reminders` must still return 2247.

### Rollback
```sql
ALTER TABLE public.compliance_obligations
  ALTER COLUMN audience_id   DROP NOT NULL,
  ALTER COLUMN recurrence_id DROP NOT NULL;
```

### Out of scope
No other phases (2d or beyond). No code changes.
