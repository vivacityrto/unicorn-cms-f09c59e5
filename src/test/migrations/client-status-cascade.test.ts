/**
 * Static guard on the client-status cascade migration. The behaviour itself
 * was proven in a rolled-back dry run against the hosted project (see the
 * audit entry); these assertions stop the safety properties being edited away.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261012040000_client_status_cascade_to_people.sql'),
  'utf8',
);

describe('client status cascade migration', () => {
  it('never touches Vivacity internal staff or Super Admins', () => {
    expect(sql).toMatch(/NOT u\.is_vivacity_internal/);
    expect(sql).toMatch(/NOT public\.is_super_admin_safe\(u\.user_uuid\)/);
  });

  it('leaves people who still belong to another active client alone', () => {
    expect(sql).toMatch(/t2\.status = 'active'/);
    expect(sql).toMatch(/tenant_users tu2/);
  });

  it('deactivates by flag only, never by deleting', () => {
    expect(sql).toMatch(/SET disabled = true/);
    expect(sql).toMatch(/SET status = 'archived'/);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('restores only what the cascade changed, and never a promoted contact', () => {
    expect(sql).toMatch(/l\.restored_at IS NULL/);
    expect(sql).toMatch(/promoted_to_user_id IS NULL/);
  });

  it('restores only on a direct status change, not one made by the legacy user trigger', () => {
    expect(sql).toMatch(/pg_trigger_depth\(\) = 1/);
  });

  it('stops the legacy trigger overwriting deliberately set client statuses', () => {
    expect(sql).toMatch(/AND t\.status IN \('active', 'inactive'\)/);
  });

  it('keeps the cascade functions and ledger away from browser roles', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.cascade_deactivate_tenant_people\(bigint, text, boolean\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.cascade_restore_tenant_people\(bigint\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.tenant_status_cascade_actions FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON public\.tenant_status_cascade_actions TO authenticated/);
  });

  it('changes no existing person by itself (no backfill statements outside the functions)', () => {
    const outsideFunctions = sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/\$function\$[\s\S]*?\$function\$/g, '');
    expect(outsideFunctions).not.toMatch(/\bUPDATE\s+public\.(users|tenant_contacts|tenants)\b/);
  });
});
