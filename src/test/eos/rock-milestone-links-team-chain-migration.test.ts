import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the Team-chain link migration, the cheap half of the oracle. The behavioural half (every
 * allowed and refused pairing, and the links already stored staying valid) is run against unicorn-qa in a
 * rolled-back transaction and recorded in docs/audit-log; these checks stop a later edit from quietly loosening
 * a rule or the function's privileges.
 */
const sql = readFileSync('supabase/migrations/20261030010000_rock_milestone_links_team_chain.sql', 'utf8');
const down = readFileSync('supabase/migrations/rollback/20261030010000_rock_milestone_links_team_chain.down.sql', 'utf8');
const flat = sql.replace(/\s+/g, ' ');

describe('validate_eos_rock_milestone_link (Team chain)', () => {
  it('replaces only the validation function and keeps it SECURITY DEFINER with an empty search_path', () => {
    expect(flat).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_eos_rock_milestone_link\(\) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''/);
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE|DROP TRIGGER|CREATE TRIGGER|INSERT INTO|UPDATE public|DELETE FROM/i);
    expect(flat).toMatch(/REVOKE ALL ON FUNCTION public\.validate_eos_rock_milestone_link\(\) FROM PUBLIC, anon;/);
  });

  it('still requires both milestones to be in the link’s tenant, and looks Rocks up in that tenant', () => {
    expect(flat).toContain("Both milestones must belong to the selected tenant");
    expect((sql.match(/tenant_id = NEW\.tenant_id/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('allows exactly three pairings: Individual to Company (directly or through a Team Rock), Individual to Team, Team to Company', () => {
    expect(flat).toContain("upper_level = 'company' AND lower_level = 'individual'");
    expect(flat).toContain("upper_level = 'team' AND lower_level = 'individual'");
    expect(flat).toContain("upper_level = 'company' AND lower_level = 'team'");
    expect((sql.match(/ELSIF upper_level/g) ?? []).length).toBe(2);
    expect(flat).toMatch(/ELSE RAISE EXCEPTION 'A milestone can only support a milestone of the Rock it serves/);
  });

  it('requires the lower Rock to serve the upper Rock, and an Individual-to-Company link to run through a Team Rock only when that Team Rock serves the Company Rock', () => {
    expect(flat).toMatch(/lower_parent_id IS DISTINCT FROM upper_rock_id AND lower_grandparent_id IS DISTINCT FROM upper_rock_id/);
    expect(flat).toMatch(/WHERE id = lower_parent_id AND tenant_id = NEW\.tenant_id AND rock_level = 'team'/);
    expect((flat.match(/IF lower_parent_id IS DISTINCT FROM upper_rock_id THEN/g) ?? []).length).toBe(2);
  });

  it('keeps the table’s column names, so nothing that reads or writes a link has to change', () => {
    expect(flat).toContain('NEW.company_milestone_id');
    expect(flat).toContain('NEW.individual_milestone_id');
  });
});

describe('the rollback', () => {
  it('changes no data: the cleanup of Team links is a comment for a person to run, not a statement (the migration audit blocks any DELETE)', () => {
    const code = down.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
    expect(code).not.toMatch(/\b(delete|update|insert|truncate|drop)\b/i);
    expect(down).toMatch(/--\s+DELETE FROM public\.eos_rock_milestone_links l/);
    expect(down.replace(/\s+/g, ' ')).toContain("r.rock_level = 'team'");
  });

  it('restores the original refusals and privileges', () => {
    const flatDown = down.replace(/\s+/g, ' ');
    expect(flatDown).toContain('Company milestone must belong to a Company Rock');
    expect(flatDown).toContain('Individual milestone must belong to an Individual Rock under the linked Company Rock');
    expect(flatDown).toMatch(/REVOKE ALL ON FUNCTION public\.validate_eos_rock_milestone_link\(\) FROM PUBLIC, anon;/);
  });
});
