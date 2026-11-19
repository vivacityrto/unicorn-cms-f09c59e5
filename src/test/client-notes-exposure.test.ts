import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const sql = read('supabase/migrations/20261120110000_restrict_internal_notes_to_staff.sql').replace(/--[^\n]*/g, '');

/** The part of the migration between two markers, so a check is about one object only. */
const between = (from: string, to?: string) => {
  const a = sql.indexOf(from);
  expect(a, `missing: ${from}`).toBeGreaterThan(-1);
  return sql.slice(a, to ? sql.indexOf(to, a + from.length) : undefined);
};

const STAFF = 'public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid()))';

describe('internal notes are for Vivacity staff only', () => {
  const policies = between('drop policy if exists notes_select on public.notes', 'create or replace view public.v_client_home_feed');

  it('replaces every policy on notes, client_notes and tenant_notes, for all four actions', () => {
    for (const table of ['notes', 'client_notes', 'tenant_notes']) {
      for (const action of ['select', 'insert', 'update', 'delete']) {
        expect(policies, `${table}_${action}`).toContain(`drop policy if exists ${table}_${action} on public.${table}`);
        expect(policies, `${table}_${action}`).toContain(`create policy ${table}_${action} on public.${table}`);
      }
    }
  });

  it('grants nothing through organisation membership any more', () => {
    for (const word of ['has_tenant_access', 'user_has_tenant_access', 'get_current_user_tenant', 'tenant_users', 'tenant_members']) {
      expect(policies, word).not.toContain(word);
    }
    expect(policies).toContain(STAFF);
    // Every policy is for signed-in users only and is gated on staff.
    const created = policies.split('create policy').slice(1);
    expect(created).toHaveLength(12);
    for (const p of created) {
      expect(p).toContain('to authenticated');
      expect(p).toContain('is_vivacity_team_safe');
    }
  });
});

describe('what clients are shown', () => {
  it('drops the urgent-note item from the client Home feed and keeps the view invoker-secured', () => {
    const view = between('create or replace view public.v_client_home_feed', 'create or replace function public.get_client_package_dashboard');
    expect(view).toContain('security_invoker = true');
    expect(view).not.toMatch(/urgent_notes|urgent_note|from notes|FROM notes/i);
    expect(view).not.toContain("'notes'::text");
  });

  it('stops returning the pinned note from the client package dashboard, keeping the status', () => {
    const fn = between('create or replace function public.get_client_package_dashboard', 'create or replace function public.get_client_package_hours_recent');
    for (const col of ['pinned_note_title', 'pinned_note_text', 'pinned_note_priority', 'pinned_note_severity']) {
      expect(fn).toMatch(new RegExp(`NULL::text AS ${col}`));
    }
    expect(fn).toContain('NULL::timestamp with time zone AS pinned_note_updated_at');
    // The pinned columns are never selected into the result any more (they are only used to work out the status).
    expect(fn).not.toMatch(/^\s*pn\.pinned_note_/m);
    expect(fn).toContain("THEN 'on_hold'");
  });

  it('stops returning staff time-entry notes to clients', () => {
    const fn = between('create or replace function public.get_client_package_hours_recent');
    expect(fn).toContain('NULL::text AS notes');
    expect(fn).not.toMatch(/te\.notes|e\.notes/);
  });
});

describe('the portal does not show internal notes to clients', () => {
  it('has no pinned-note banner on the client package page', () => {
    const page = read('src/components/client/ClientPackagesPage.tsx');
    expect(page).not.toContain('PinnedNoteBanner');
    expect(page).not.toContain('pinned_note_text');
    expect(page).not.toContain('pinned_note_title');
  });

  it('has no notes line in the client recent work list', () => {
    const list = read('src/components/client/package-dashboard/PackageRecentWork.tsx');
    expect(list).not.toMatch(/\be\.notes\b|cleanWorkNote/);
  });
});
