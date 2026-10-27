import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RockCard } from '@/components/eos/rocks/RockCard';
import type { RockWithHierarchy } from '@/types/eos';

const rock: RockWithHierarchy = {
  id: 'rock-company-001',
  tenant_id: 6372,
  title: 'Increase Revenue by 20%',
  status: 'on_track',
  quarter_year: 2026,
  quarter_number: 1,
  due_date: '2026-03-31T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  rock_level: 'company',
  childStats: { total: 1, complete: 0, offTrack: 0 },
};

describe('RockCard dialog entry points', () => {
  it('opens the Rock from a click on non-interactive card content', () => {
    const onEdit = vi.fn();
    render(<RockCard rock={rock} onEdit={onEdit} />);

    fireEvent.click(screen.getByText('Due Mar 31'));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(rock);
  });

  it('opens the Rock from its keyboard-accessible title button', () => {
    const onEdit = vi.fn();
    render(<RockCard rock={rock} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Rock: Increase Revenue by 20%' }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(rock);
  });

  it('opens compact Rocks from non-interactive card content', () => {
    const onEdit = vi.fn();
    render(<RockCard rock={rock} onEdit={onEdit} compact />);

    fireEvent.click(screen.getByText('Company'));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(rock);
  });

  it('keeps nested card actions from triggering the card click handler twice', () => {
    const onEdit = vi.fn();
    const onViewCascade = vi.fn();
    render(<RockCard rock={rock} onEdit={onEdit} onViewCascade={onViewCascade} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(rock);
    expect(onViewCascade).not.toHaveBeenCalled();
  });
});
