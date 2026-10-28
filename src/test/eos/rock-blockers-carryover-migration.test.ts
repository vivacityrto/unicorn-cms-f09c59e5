import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the migration, the cheap half of the oracle. The behavioural half
 * (every rule below actually refusing the bad input) was run against unicorn-qa in
 * rolled-back transactions and is recorded in docs/audit-log; these checks stop a
 * later edit from quietly removing a rule or loosening a grant.
 */
const sql = readFileSync('supabase/migrations/20261028020000_rock_blockers_and_carryover.sql', 'utf8');
const down = readFileSync('supabase/migrations/rollback/20261028020000_rock_blockers_and_carryover.down.sql', 'utf8');
const flat = sql.replace(/\s+/g, ' ');

const fn = (name: string) => {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = sql.indexOf('$function$;', sql.indexOf('AS $function$', start));
  return sql.slice(start, end);
};

describe('blockers', () => {
  it('has one open blocker per Rock and per milestone, and exactly one subject', () => {
    expect(flat).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_eos_rock_blockers_open_rock ON public.eos_rock_blockers \(rock_id\) WHERE resolved_at IS NULL/);
    expect(flat).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_eos_rock_blockers_open_milestone ON public.eos_rock_blockers \(milestone_id\) WHERE resolved_at IS NULL/);
    expect(flat).toMatch(/eos_rock_blockers_one_subject CHECK/);
  });

  it('requires a reason at the table, and refuses self and double dependencies and unsafe links', () => {
    expect(flat).toMatch(/reason text NOT NULL/);
    expect(flat).toMatch(/length\(btrim\(reason\)\) BETWEEN 1 AND 1000/);
    expect(flat).toMatch(/eos_rock_blockers_not_self_rock/);
    expect(flat).toMatch(/eos_rock_blockers_not_self_milestone/);
    expect(flat).toMatch(/eos_rock_blockers_one_dependency/);
    expect(flat).toMatch(/evidence_url ~\* '\^https\?:\/\/'/);
  });

  it('refuses a blocked status without an open blocker, at commit, for Rocks and milestones', () => {
    expect(flat).toMatch(/CREATE CONSTRAINT TRIGGER trg_require_open_blocker_rock AFTER INSERT OR UPDATE OF status ON public.eos_rocks DEFERRABLE INITIALLY DEFERRED/);
    expect(flat).toMatch(/CREATE CONSTRAINT TRIGGER trg_require_open_blocker_milestone AFTER INSERT OR UPDATE OF status ON public.eos_rock_milestones DEFERRABLE INITIALLY DEFERRED/);
    expect(fn('require_open_blocker')).toContain('needs a reason');
  });

  it('keeps blockers in the same tenant as what they block, including dependencies', () => {
    const body = fn('validate_eos_rock_blocker');
    expect(body).toMatch(/same tenant/);
    expect(body).toMatch(/depends_on_rock_id/);
    expect(body).toMatch(/depends_on_milestone_id/);
    expect(flat).toMatch(/FOREIGN KEY \(milestone_id, tenant_id\) REFERENCES public.eos_rock_milestones\(id, tenant_id\)/);
  });

  it('resolves automatically when the status leaves blocked by any route', () => {
    expect(flat).toMatch(/AFTER UPDATE OF status ON public.eos_rocks FOR EACH ROW WHEN \(OLD.status IS DISTINCT FROM NEW.status\)/);
    expect(flat).toMatch(/AFTER UPDATE OF status ON public.eos_rock_milestones FOR EACH ROW WHEN \(OLD.status IS DISTINCT FROM NEW.status\)/);
  });

  it('never lets resolving complete the work', () => {
    const body = fn('resolve_blocker');
    expect(body).toMatch(/p_new_status IN \('complete', 'blocked'\)/);
    expect(body).not.toMatch(/SET status = 'complete'/);
  });

  it('refuses to block completed work or an archived Rock', () => {
    const body = fn('set_blocker');
    expect(body).toMatch(/Completed work cannot be blocked/);
    expect(body).toMatch(/An archived Rock cannot be blocked/);
  });
});

describe('carryover', () => {
  it('is its own relation, not the Company-to-Individual milestone link table', () => {
    expect(flat).toMatch(/CREATE TABLE IF NOT EXISTS public.eos_rock_carryovers/);
    expect(flat).toMatch(/CREATE TABLE IF NOT EXISTS public.eos_rock_carryover_milestones/);
    expect(flat).not.toMatch(/ALTER TABLE public.eos_rock_milestone_links/);
  });

  it('prevents duplicates: one row per pair, and a milestone is carried at most once', () => {
    expect(flat).toMatch(/eos_rock_carryovers_pair_key UNIQUE \(source_rock_id, destination_rock_id\)/);
    expect(flat).toMatch(/eos_rock_carryover_milestones_source_once UNIQUE \(source_milestone_id\)/);
    expect(flat).toMatch(/eos_rock_carryover_milestones_destination_once UNIQUE \(destination_milestone_id\)/);
  });

  it('enforces tenant, level, later quarter, loops and parent continuity in the database', () => {
    const body = fn('validate_eos_rock_carryover');
    expect(body).toMatch(/must stay within one tenant/);
    expect(body).toMatch(/same level/);
    expect(body).toMatch(/later quarter/);
    expect(body).toMatch(/WITH RECURSIVE/);
    expect(body).toMatch(/would create a loop/);
    expect(body).toMatch(/must serve the Rock its parent was carried into/);
    expect(flat).toMatch(/CREATE TRIGGER trg_validate_eos_rock_carryover BEFORE INSERT ON public.eos_rock_carryovers/);
  });

  it('refuses completed or foreign milestones in the provenance rows', () => {
    const body = fn('validate_eos_rock_carryover_milestone');
    expect(body).toMatch(/Completed milestones are not carried forward/);
    expect(body).toMatch(/must belong to the source Rock/);
    expect(body).toMatch(/must belong to the destination Rock/);
  });

  it('keeps provenance when a milestone is later deleted, and refuses to delete a Rock in a carryover', () => {
    expect(flat).toMatch(/ON DELETE SET NULL \(source_milestone_id\)/);
    expect(flat).toMatch(/ON DELETE SET NULL \(destination_milestone_id\)/);
    expect(flat).toMatch(/source_rock_id uuid NOT NULL REFERENCES public.eos_rocks\(id\) ON DELETE RESTRICT/);
    expect(flat).toMatch(/THEN 'carryover' END/);
  });

  it('never writes to the source Rock or its milestones', () => {
    const body = fn('carry_forward_rock');
    expect(body).not.toMatch(/UPDATE public.eos_rocks/);
    expect(body).not.toMatch(/UPDATE public.eos_rock_milestones/);
    expect(body).not.toMatch(/DELETE FROM/);
    expect(body).toMatch(/A completed Rock has nothing to carry forward/);
    expect(body).toMatch(/Completed milestones are not carried forward/);
  });
});

describe('access', () => {
  const staffGated = ['set_blocker', 'resolve_blocker', 'carry_forward_rock'];

  it.each(staffGated)('%s is staff only, runs with an empty search_path, and is not callable by anon', name => {
    const body = fn(name);
    expect(body).toMatch(/is_vivacity_team_safe\(auth.uid\(\)\)/);
    expect(body).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(flat).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon`));
    expect(flat).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated`));
  });

  it('has row level security on every new table, select only, and no direct write grants', () => {
    for (const table of ['eos_rock_blockers', 'eos_rock_carryovers', 'eos_rock_carryover_milestones']) {
      expect(flat).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      expect(flat).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`));
    }
    expect(flat).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]* ON public\.eos_rock_(blockers|carryovers|carryover_milestones)/);
    expect(flat).toMatch(/is_vivacity_team_user/);
    expect(flat).toMatch(/has_any_eos_role/);
  });

  it('keeps trigger functions out of reach of clients', () => {
    for (const name of ['validate_eos_rock_blocker', 'require_open_blocker', 'resolve_blocker_on_status_change', 'validate_eos_rock_carryover', 'validate_eos_rock_carryover_milestone']) {
      expect(flat).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });
});

describe('rollback', () => {
  it('drops everything the migration adds, and restores the previous delete guard', () => {
    const created = Array.from(sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/g)).map(m => m[1]).filter(n => n !== 'rock_delete_blockers');
    for (const name of created) expect(down).toContain(`DROP FUNCTION IF EXISTS public.${name}(`);
    for (const table of ['eos_rock_blockers', 'eos_rock_carryovers', 'eos_rock_carryover_milestones']) expect(down).toContain(`DROP TABLE IF EXISTS public.${table}`);
    expect(down).toMatch(/CREATE OR REPLACE FUNCTION public.rock_delete_blockers/);
    expect(down).not.toContain("'carryover'");
    expect(down).toMatch(/DELETE FROM public.dd_rock_status WHERE value = 'blocked'/);
    expect(down).toMatch(/UPDATE public.eos_rocks SET status = 'at_risk' WHERE status = 'blocked'/);
  });
});
