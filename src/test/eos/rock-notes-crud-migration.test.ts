import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261031054829_rock_notes_crud.sql', 'utf8');
const down = readFileSync('supabase/migrations/rollback/20261031054829_rock_notes_crud.down.sql', 'utf8');
const flat = sql.replace(/\s+/g, ' ');
const mutationGuard = sql.slice(sql.indexOf('FUNCTION public.enforce_eos_rock_notes_mutations('), sql.indexOf('$function$;', sql.indexOf('AS $function$')));
const mutationGuardFlat = mutationGuard.replace(/\s+/g, ' ');

describe('Rock notes CRUD migration', () => {
  it('adds an edit timestamp without changing the original creation timestamp', () => {
    expect(flat).toContain('ALTER TABLE public.eos_rock_notes ADD COLUMN edited_at timestamptz;');
    expect(flat).toMatch(/GRANT UPDATE \(body\) ON public\.eos_rock_notes TO authenticated/);
    expect(flat).toMatch(/GRANT DELETE ON public\.eos_rock_notes TO authenticated/);
    expect(flat).not.toMatch(/GRANT INSERT ON public\.eos_rock_notes/);
  });

  it('limits edits and deletes to staff authors or Super Admins within RLS', () => {
    expect(flat).toMatch(/FOR UPDATE TO authenticated USING \( public\.is_vivacity_team_safe\(\(SELECT auth\.uid\(\)\)\) AND \(created_by = \(SELECT auth\.uid\(\)\) OR public\.is_super_admin\(\)\) \) WITH CHECK/);
    expect(flat).toMatch(/FOR DELETE TO authenticated USING \( public\.is_vivacity_team_safe\(\(SELECT auth\.uid\(\)\)\) AND \(created_by = \(SELECT auth\.uid\(\)\) OR public\.is_super_admin\(\)\) \)/);
  });

  it('permits only body edits, timestamps those edits, and keeps the meeting-delete exception', () => {
    expect(mutationGuardFlat).toContain('NEW.body IS DISTINCT FROM OLD.body');
    expect(mutationGuardFlat).toContain("(to_jsonb(NEW) - 'body' - 'edited_at') = (to_jsonb(OLD) - 'body' - 'edited_at')");
    expect(mutationGuardFlat).toContain('NEW.edited_at := statement_timestamp()');
    expect(mutationGuardFlat).toContain('OLD.meeting_id IS NOT NULL AND NEW.meeting_id IS NULL');
    expect(mutationGuardFlat).toContain("(to_jsonb(NEW) - 'meeting_id' - 'edited_at') = (to_jsonb(OLD) - 'meeting_id' - 'edited_at')");
    expect(mutationGuardFlat).toContain("IF TG_OP = 'DELETE' THEN RETURN OLD;");
  });

  it('restores the append-only guard on rollback and documents irreversible deletes', () => {
    expect(down).toContain('hard-deleted notes cannot be restored');
    expect(down).toContain('DROP FUNCTION IF EXISTS public.enforce_eos_rock_notes_mutations()');
    expect(down).toContain('trg_eos_rock_notes_append_only');
    expect(down).toContain("RAISE EXCEPTION 'Rock notes are a permanent record and cannot be changed or deleted'");
    expect(down).toContain('DROP COLUMN IF EXISTS edited_at');
  });
});
