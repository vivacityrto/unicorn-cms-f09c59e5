## Fix `start_client_package` to include multi-stage document links

`start_client_package` was missed in the earlier multi-stage rewrite. It seeds `document_instances` itself (bypassing `seed_stage_instances_from_template` via `app.skip_stage_seed`), so its own WHERE clause needs the same `document_stage_links` union that the other three provisioning RPCs already have.

## Change

Fetch the current definition via `pg_get_functiondef('public.start_client_package'::regprocedure)`, then `CREATE OR REPLACE FUNCTION` with a single edit to the `document_instances` INSERT:

```sql
INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
SELECT d.id, v_stage_instance_id, p_tenant_id, 'pending', false
  FROM public.documents d
 WHERE d.stage = v_stage.stage_id::integer
    OR EXISTS (
      SELECT 1 FROM public.document_stage_links dsl
      WHERE dsl.document_id = d.id
        AND dsl.stage_id = v_stage.stage_id::integer
    );
```

Every other line — signature, billing-type logic, duplicate-package guard, `stage_instances`/`staff_task_instances`/`client_task_instances`/`email_instances` inserts, audit log insert, `SECURITY DEFINER`, `SET search_path = ''`, `app.skip_stage_seed` toggle — stays byte-identical.

Delivered as one migration containing only the `CREATE OR REPLACE FUNCTION` statement.

## Out of scope

- No changes to `seed_stage_instances_from_template`, `publish_stage_version`, or `repair_package_instance_stages`.
- No changes to the `app.skip_stage_seed` mechanism.
- No other Tier 1/2/3 sweep items.
- No frontend changes.

## Verification

1. `pg_get_functiondef` diff before/after shows only the added `OR EXISTS` clause changed.
2. Confirm `SECURITY DEFINER` and `SET search_path = ''` remain.
3. Call `start_client_package` for a tenant against an old-track package (e.g. M-AM); confirm resulting `document_instances` include the 37 shared documents linked via `document_stage_links`.

## Rollback

Re-apply the prior definition captured from `pg_get_functiondef` before the migration.
