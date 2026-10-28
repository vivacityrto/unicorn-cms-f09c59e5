import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MilestonesEditor } from '@/components/eos/rockEditor/MilestonesEditor';
import type { EditorMilestone } from '@/utils/rockEditor/types';

vi.mock('@/components/eos/VivacityTeamPicker', () => ({ VivacityTeamPicker: () => <div /> }));

Element.prototype.scrollIntoView = vi.fn();

const milestone = (status: EditorMilestone['status']): EditorMilestone => ({
  id: 'm1', title: 'Train the team', ownerId: null, dueDate: '', priority: 'medium', exitCriteria: '', evidenceUrl: '', status, supports: [],
});

const renderEditor = (status: EditorMilestone['status']) => {
  render(
    <MilestonesEditor
      milestones={[milestone(status)]}
      onChange={vi.fn()}
      validation={{ errors: {}, warnings: {} }}
      showErrors={false}
      rockOwnerLabel="Sam"
      rockDueLabel="31 Dec"
      companyMilestones={[]}
      isIndividual={false}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show details for milestone 1' }));
};

describe('MilestonesEditor and blocked milestones', () => {
  it('does not let a milestone be set to blocked from the plain status choice', async () => {
    renderEditor('in_progress');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Status for milestone 1' }), { key: 'ArrowDown' });
    const blocked = await screen.findByRole('option', { name: /Blocked \(use Mark as blocked/ });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: 'Complete' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('still shows a milestone that is already blocked as blocked, so saving the Rock does not change it', () => {
    renderEditor('blocked');
    expect(screen.getByRole('combobox', { name: 'Status for milestone 1' })).toHaveTextContent(/Blocked/);
  });
});
