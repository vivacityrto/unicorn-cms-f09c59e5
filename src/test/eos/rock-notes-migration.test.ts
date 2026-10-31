import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the Rock notes migration, the cheap half of the oracle. The behavioural half
 * (staff-only creation, the snapshot, the duplicate guard, append-only baseline, the delete guard, grants)
 * was run against unicorn-qa in a rolled-back transaction and is recorded in docs/audit-log;
 * these checks stop a later edit from quietly removing a rule or loosening a grant.
 */
const sql = readFileSync('supabase/migrations/20261028120000_rock_notes.sql', 'utf8');
const down = readFileSync('supabase/migrations/rollback/20261028120000_rock_notes.down.sql', 'utf8');
const flat = sql.replace(/\s+/g, ' ');

const fn = (name: string) => {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = sql.indexOf('$function$;', sql.indexOf('AS $function$', start));
  return sql.slice(start, end);
};

describe('eos_rock_notes', () => {
  it('bounds the text and the source at the table, and keeps progress consistent', () => {
    expect(flat).toMatch(/length\(btrim\(body\)\) BETWEEN 1 AND 4000/);
    expect(flat).toMatch(/source IN \('typed', 'dictated'\)/);
    expect(flat).toMatch(/milestones_total >= milestones_complete/);
  });

  it('cannot lose a Rock to its notes: the Rock is restricted, a deleted meeting only clears the link', () => {
    expect(flat).toMatch(/rock_id uuid NOT NULL REFERENCES public\.eos_rocks\(id\) ON DELETE RESTRICT/);
    expect(flat).toMatch(/meeting_id uuid REFERENCES public\.eos_meetings\(id\) ON DELETE SET NULL/);
  });

  it('is read-only to clients: select only, no direct writes, reads follow the Rock rules', () => {
    expect(flat).toContain('REVOKE ALL ON public.eos_rock_notes FROM PUBLIC, anon, authenticated; GRANT SELECT ON public.eos_rock_notes TO authenticated;');
    expect(flat).toMatch(/CREATE POLICY eos_rock_notes_select ON public\.eos_rock_notes FOR SELECT TO authenticated USING \( public\.is_vivacity_team_user/);
    expect(flat).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]* ON public\.eos_rock_notes/);
  });

  it('is append-only: updates and deletes are refused except a deleted meeting clearing meeting_id', () => {
    expect(flat).toMatch(/CREATE TRIGGER trg_eos_rock_notes_append_only BEFORE UPDATE OR DELETE ON public\.eos_rock_notes FOR EACH ROW/);
    const body = fn('enforce_eos_rock_notes_append_only');
    expect(body).toContain("(to_jsonb(NEW) - 'meeting_id') = (to_jsonb(OLD) - 'meeting_id')");
    expect(body).toContain('permanent record');
  });
});

describe('add_rock_note', () => {
  const body = () => fn('add_rock_note');

  it('is staff-only, checked first, and runs with an empty search_path', () => {
    const text = body();
    expect(text.indexOf('is_vivacity_team_safe(auth.uid())')).toBeGreaterThan(-1);
    expect(text.indexOf('is_vivacity_team_safe(auth.uid())')).toBeLessThan(text.indexOf('INSERT INTO'));
    expect(text).toContain('Forbidden: staff only');
    expect(sql).toMatch(/FUNCTION public\.add_rock_note[\s\S]*?SECURITY DEFINER\s+SET search_path = ''/);
    expect(flat).toContain('REVOKE ALL ON FUNCTION public.add_rock_note(uuid, text, uuid, text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.add_rock_note(uuid, text, uuid, text) TO authenticated;');
  });

  it('reads the status and progress from the database, never from the caller', () => {
    const text = body();
    expect(text).toMatch(/SELECT tenant_id, status, archived_at INTO v_tenant, v_status, v_archived/);
    expect(text).toMatch(/count\(\*\) FILTER \(WHERE status <> 'deferred'\)/);
    expect(flat).not.toMatch(/p_status|p_progress|p_tenant/);
  });

  it('refuses blank, oversized, mistyped, archived-Rock and unknown-meeting input, and repeats within 30 seconds', () => {
    const text = body();
    for (const rule of ['A note needs some text', '4000 characters', 'either typed or dictated', 'archived Rock cannot take new notes', 'Meeting not found', "interval '30 seconds'"]) {
      expect(text).toContain(rule);
    }
  });

  it('records who wrote it as the caller, not a supplied id', () => {
    expect(body()).toMatch(/v_body, p_source, v_status, v_complete, v_total, auth\.uid\(\)\)/);
  });
});

describe('eos_rock_note_summaries', () => {
  it('only the service role writes: clients get select only, and signals and to-dos are constrained', () => {
    expect(flat).toContain('REVOKE ALL ON public.eos_rock_note_summaries FROM PUBLIC, anon, authenticated; GRANT SELECT ON public.eos_rock_note_summaries TO authenticated;');
    expect(flat).toMatch(/status_signal IN \('on_track', 'at_risk', 'off_track', 'unclear'\)/);
    expect(flat).toMatch(/jsonb_typeof\(suggested_todos\) = 'array'/);
  });
});

describe('delete guard', () => {
  it('refuses to delete a Rock that has notes, keeping every earlier reason', () => {
    const text = fn('rock_delete_blockers');
    for (const reason of ['children', 'linked_issues', 'milestone_progress', 'task_links', 'milestone_links', 'outcomes', 'carryover', 'notes']) {
      expect(text).toContain(`'${reason}'`);
    }
    expect(text).toContain('public.eos_rock_notes n WHERE n.rock_id = p_rock_id');
  });
});

describe('rollback', () => {
  it('restores the earlier guard and drops what the migration added, in dependency order', () => {
    expect(down).not.toContain("'notes'");
    expect(down).toContain("'carryover'");
    expect(down.indexOf('DROP TABLE IF EXISTS public.eos_rock_note_summaries')).toBeGreaterThan(-1);
    expect(down.indexOf('DROP TABLE IF EXISTS public.eos_rock_notes')).toBeGreaterThan(down.indexOf('DROP TABLE IF EXISTS public.eos_rock_note_summaries'));
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.add_rock_note\(uuid, text, uuid, text\)/);
  });
});
