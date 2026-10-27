import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RockCascadeView } from '@/components/eos/rocks/RockCascadeView';
import type { RockWithHierarchy } from '@/types/eos';

const base: RockWithHierarchy = {
  id: 'company-1',
  tenant_id: 6372,
  title: 'Harden RBAC across the platform',
  status: 'on_track',
  quarter_year: 2026,
  quarter_number: 4,
  due_date: '2026-12-31T00:00:00.000Z',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  rock_level: 'company',
};

const child: RockWithHierarchy = {
  ...base,
  id: 'individual-1',
  title: 'Inventory and containment',
  rock_level: 'individual',
  parent_rock_id: 'company-1',
};

const allRocks = [base, child];

describe('RockCascadeView', () => {
  it('opens the details for a Rock when its row is clicked', () => {
    const onOpenRock = vi.fn();
    render(<RockCascadeView rock={base} allRocks={allRocks} onOpenRock={onOpenRock} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Rock: Inventory and containment' }));

    expect(onOpenRock).toHaveBeenCalledExactlyOnceWith(child);
  });

  it('opens a nested Rock from non-interactive row content without double firing', () => {
    const onOpenRock = vi.fn();
    const { container } = render(<RockCascadeView rock={base} allRocks={allRocks} onOpenRock={onOpenRock} />);

    const rowCard = screen.getByRole('button', { name: 'Open Rock: Inventory and containment' }).closest('.cursor-pointer');
    expect(rowCard).not.toBeNull();
    fireEvent.click(rowCard as Element);

    expect(onOpenRock).toHaveBeenCalledExactlyOnceWith(child);
    expect(container.querySelectorAll('.cursor-pointer').length).toBeGreaterThan(0);
  });

  it('keeps the add-child actions from opening the details', () => {
    const onOpenRock = vi.fn();
    const onCreateTeamRock = vi.fn();
    render(
      <RockCascadeView rock={base} allRocks={allRocks} onOpenRock={onOpenRock} onCreateTeamRock={onCreateTeamRock} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Team Rock/ }));

    expect(onCreateTeamRock).toHaveBeenCalledExactlyOnceWith(base);
    expect(onOpenRock).not.toHaveBeenCalled();
  });

  it('does not look clickable when no open handler is supplied', () => {
    const { container } = render(<RockCascadeView rock={base} allRocks={allRocks} />);

    expect(container.querySelector('.cursor-pointer')).toBeNull();
    expect(screen.queryByRole('button', { name: /Open Rock/ })).toBeNull();
  });
});
