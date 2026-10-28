import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MilestoneTable } from '@/components/eos/rocks/detail/MilestoneTable';

const milestone = {
  id: 'm1', title: 'M1 - Train the team', label: 'Train the team', number: 1, status: 'not_started' as const,
  priority: 'medium', ownerId: 'u1', dueDate: '2099-12-31', exitCriteria: null, evidenceUrl: null, order: 1,
};

/**
 * jsdom does no layout, so this guards the cause rather than the pixels: the owner name
 * must sit in a block-level flex box that can shrink and truncate. In an inline-flex box
 * (sized to its text) a long name never truncates and runs into the Due column.
 */
describe('MilestoneTable owner cell', () => {
  it('lets a long owner name shrink and truncate instead of spilling into the next column', () => {
    render(
      <MilestoneTable
        milestones={[milestone]}
        attentionIds={new Set()}
        tasksByMilestone={new Map()}
        rockLevel="individual"
        hasRows
        rockOwnerId="u1"
        todayIso="2026-10-28"
        getUserInfo={() => ({ name: 'Angela Connell-Richards', initials: 'AC' })}
      />,
    );
    const owner = screen.getByTitle('Angela Connell-Richards');
    expect(owner.className).toMatch(/\bflex\b/);
    expect(owner.className).not.toMatch(/inline-flex/);
    expect(owner.className).toContain('min-w-0');
    expect(owner.querySelector('.truncate')).toHaveTextContent('Angela Connell-Richards');
  });
});
