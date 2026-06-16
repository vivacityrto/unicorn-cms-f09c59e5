## Migration: fix `public.rpc_create_action_item`

Create one new migration that does `CREATE OR REPLACE FUNCTION public.rpc_create_action_item(...)` with the same signature, `SECURITY DEFINER`, and `SET search_path = ''`. No GRANT/REVOKE changes (none exist on the current definition; the existing privileges are preserved by `CREATE OR REPLACE`).

### Bug 1 — Remove duplicate timeline insert
Delete the entire `INSERT INTO public.client_timeline_events (...) VALUES (...)` block before `RETURN`. The `trg_action_item_timeline` AFTER INSERT trigger handles it.

### Bug 2 — Priority validation
Note: the live function does **not** use the stale `IN ('low','normal','high','urgent')` check described in the request. It currently validates against the `public.dd_priority` lookup table:

```sql
IF NOT EXISTS (SELECT 1 FROM public.dd_priority WHERE value = p_priority AND is_active = true) THEN
  RETURN jsonb_build_object('success', false, 'error', 'Invalid priority');
END IF;
```

Per project rules (lookup tables are the source of truth for dropdowns; don't hard-code dropdown values), the lookup-based check is the correct pattern and already accepts `medium`. **Recommendation: keep the `dd_priority` lookup validation as-is** rather than replacing it with a hard-coded `IN (...)` list. Please confirm — or tell me to replace it with the literal `IN ('low','medium','high','urgent')` check anyway.

### Dead code cleanup
- Remove `v_user_name text;` and `v_owner_name text;` from `DECLARE`.
- Remove both `SELECT ... INTO v_user_name` / `v_owner_name` blocks (only consumed by the deleted timeline insert).

### Resulting body (abbreviated)
```text
DECLARE v_user_id uuid; v_action_id uuid;
BEGIN
  auth check
  title check
  dd_priority lookup check    -- unchanged (pending your confirmation)
  source check
  INSERT INTO client_action_items ... RETURNING id INTO v_action_id;
  RETURN jsonb_build_object('success', true, 'action_item_id', v_action_id);
END;
```

No other files change.