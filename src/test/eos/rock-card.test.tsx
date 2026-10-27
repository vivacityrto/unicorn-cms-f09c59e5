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

describe('RockCard entry points', () => {
  it('opens the Rock details from a click on non-interactive card content', () => {
    const onOpen = vi.fn();
    render(<RockCard rock={rock} onOpen={onOpen} />);

    fireEvent.click(screen.getByText('Due Mar 31'));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(rock);
  });

  it('opens the Rock details from its keyboard-accessible title button', () => {
    const onOpen = vi.fn();
    render(<RockCard rock={rock} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Rock: Increase Revenue by 20%' }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(rock);
  });

  it('opens compact Rocks from non-interactive card content', () => {
    const onOpen = vi.fn();
    render(<RockCard rock={rock} onOpen={onOpen} compact />);

    fireEvent.click(screen.getByText('Company'));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(rock);
  });

  it('keeps Edit separate from opening the read-only details', () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onViewCascade = vi.fn();
    render(<RockCard rock={rock} onOpen={onOpen} onEdit={onEdit} onViewCascade={onViewCascade} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(rock);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onViewCascade).not.toHaveBeenCalled();
  });

  it('does not look clickable when no open handler is supplied', () => {
    const { container } = render(<RockCard rock={rock} onEdit={vi.fn()} />);

    expect(container.querySelector('.cursor-pointer')).toBeNull();
    expect(screen.queryByRole('button', { name: /Open Rock/ })).toBeNull();
  });
});
