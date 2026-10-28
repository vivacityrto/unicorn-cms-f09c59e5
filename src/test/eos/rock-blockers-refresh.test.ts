import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The hierarchy's milestone counts come from their own query. A blocker or a carryover
 * changes milestone statuses and adds milestones, so both mutations must refresh it,
 * or the card's progress stays stale until a reload.
 */
describe('mutations that change milestones refresh the hierarchy progress query', () => {
  it.each(['src/hooks/useRockBlockers.ts', 'src/hooks/useRockCarryover.ts'])('%s', file => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain("['eos-rock-milestone-progress']");
    expect(source).toContain("['eos-rocks-hierarchy']");
  });
});
