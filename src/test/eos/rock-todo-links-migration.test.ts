import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the To-Do link migration, the cheap half of the oracle. The behavioural half
 * (every refusal, the move, the cascades, the grants) was run against unicorn-qa in a rolled-back
 * transaction and is recorded in docs/audit-log; these checks stop a later edit from quietly
 * removing a rule or loosening a grant.
 */
const sql = readFileSync('supabase/migrations/20261029030000_rock_todo_links.sql', 'utf8');
const down = readFileSync('supabase/migrations/rollback/20261029030000_rock_todo_links.down.sql', 'utf8');
const flat = sql.replace(/\s+/g, ' ');

const fn = (name: string) => {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = sql.indexOf('$function$;', sql.indexOf('AS $function$', start));
  return sql.slice(start, end);
};

describe('eos_rock_todo_links', () => {
  it('links a To-Do to at most one Rock, optionally one milestone, and never deletes the To-Do with the link', () => {
    expect(flat).toMatch(/todo_id uuid NOT NULL UNIQUE REFERENCES public\.eos_todos\(id\) ON DELETE CASCADE/);
    expect(flat).toMatch(/rock_id uuid NOT NULL REFERENCES public\.eos_rocks\(id\) ON DELETE CASCADE/);
    expect(flat).toMatch(/milestone_id uuid REFERENCES public\.eos_rock_milestones\(id\) ON DELETE CASCADE/);
    expect(flat).not.toMatch(/eos_todos[^;]*DELETE FROM/);
  });

  it('is read-only to clients: select only, reads follow the Rock rules, no direct writes', () => {
    expect(flat).toContain('REVOKE ALL ON public.eos_rock_todo_links FROM PUBLIC, anon, authenticated; GRANT SELECT ON public.eos_rock_todo_links TO authenticated;');
    expect(flat).toMatch(/CREATE POLICY eos_rock_todo_links_select ON public\.eos_rock_todo_links FOR SELECT TO authenticated USING \( public\.is_vivacity_team_user/);
    expect(flat).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]* ON public\.eos_rock_todo_links/);
  });

  it('holds the milestone-belongs-to-the-Rock and tenant rules for any writer, by trigger', () => {
    expect(flat).toMatch(/CREATE TRIGGER trg_validate_eos_rock_todo_link BEFORE INSERT OR UPDATE ON public\.eos_rock_todo_links/);
    const body = fn('validate_eos_rock_todo_link');
    expect(body).toContain('The milestone must belong to the Rock');
    expect(body).toContain("The link must carry the Rock''s tenant");
  });
});

describe.each(['add_rock_todo', 'link_todo_to_rock', 'unlink_todo_from_rock'])('%s', name => {
  it('is staff-only (checked first), SECURITY DEFINER with an empty search_path, and not callable by anon', () => {
    const text = fn(name);
    const gate = text.indexOf('is_vivacity_team_safe(auth.uid())');
    expect(gate).toBeGreaterThan(-1);
    const firstWrite = Math.min(...['INSERT INTO', 'DELETE FROM'].map(w => text.indexOf(w)).filter(i => i > -1));
    expect(gate).toBeLessThan(firstWrite);
    expect(text).toContain('Forbidden: staff only');
    expect(sql).toMatch(new RegExp(`FUNCTION public\\.${name}[\\s\\S]*?SECURITY DEFINER\\s+SET search_path = ''`));
    expect(flat).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated;`));
  });
});

describe('add_rock_todo', () => {
  const text = () => fn('add_rock_todo');

  it('refuses a blank or oversized title, an archived Rock, a milestone of another Rock, a non-staff owner and an unknown meeting', () => {
    for (const rule of ['A To-Do needs a title', '300 characters', 'archived Rock cannot take new To-Dos', 'The milestone must belong to the Rock', 'owned by an active team member', 'Meeting not found']) {
      expect(text()).toContain(rule);
    }
  });

  it('puts the To-Do in the meeting\'s tenant inside a meeting, owns it by the caller by default, and ignores repeats within 30 seconds', () => {
    expect(text()).toContain('SELECT tenant_id INTO v_todo_tenant FROM public.eos_meetings');
    expect(text()).toContain('COALESCE(p_owner_id, auth.uid())');
    expect(text()).toContain("interval '30 seconds'");
  });

  it('creates the To-Do as Open, created by the caller', () => {
    expect(text()).toMatch(/v_owner, auth\.uid\(\), p_meeting_id, COALESCE\(p_due_date, current_date \+ 7\), 'Open'/);
  });
});

describe('unlink_todo_from_rock', () => {
  it('only removes the link and never touches the To-Do', () => {
    const text = fn('unlink_todo_from_rock');
    expect(text).toContain('DELETE FROM public.eos_rock_todo_links WHERE todo_id = p_todo_id');
    expect(text).not.toMatch(/eos_todos/);
  });
});

describe('rollback', () => {
  it('drops what the migration added and leaves the To-Dos alone', () => {
    for (const drop of ['unlink_todo_from_rock(uuid)', 'link_todo_to_rock(uuid, uuid, uuid)', 'add_rock_todo(uuid, text, uuid, date, uuid, uuid)', 'TABLE IF EXISTS public.eos_rock_todo_links']) {
      expect(down).toContain(drop);
    }
    expect(down).not.toMatch(/DROP TABLE[^;]*eos_todos/);
  });
});
