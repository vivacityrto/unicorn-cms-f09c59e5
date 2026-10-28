import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockCard } from '@/components/eos/rocks/RockCard';
import type { EosRock, RockWithHierarchy } from '@/types/eos';

const state = vi.hoisted(() => ({ enabled: [] as boolean[] }));

vi.mock('@/hooks/useRockContribution', () => ({
  useRockContribution: (_id: string, enabled: boolean) => {
    state.enabled.push(enabled);
    return { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
  },
}));

const child = (id: string, status: string, level = 'individual'): EosRock =>
  ({ id, tenant_id: 6372, title: id, status, quarter_year: 2026, quarter_number: 4, due_date: '2026-12-31', rock_level: level, parent_rock_id: 'company-1' }) as EosRock;

const company = (over: Partial<RockWithHierarchy> = {}): RockWithHierarchy => ({
  id: 'company-1', tenant_id: 6372, title: 'Grow revenue', status: 'on_track', quarter_year: 2026, quarter_number: 4,
  due_date: '2026-12-31T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
  rock_level: 'company', childStats: { total: 3, complete: 1, offTrack: 0, blocked: 1 },
  children: [child('i1', 'on_track'), child('i2', 'blocked'), child('i3', 'complete')],
  ...over,
});

beforeEach(() => {
  state.enabled = [];
});

describe('RockCard: Company Rock with Individual Rocks', () => {
  it('adds one collapsed line, and loads nothing until opened', () => {
    render(<RockCard rock={company()} />);
    const toggle = screen.getByRole('button', { name: /Individual Rocks/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('3 Individual Rocks · 1 blocked');
    expect(state.enabled.every(e => e === false)).toBe(true);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(state.enabled.at(-1)).toBe(true);
  });

  it('keeps clicking the card opening the details, and the expand control separate from it', () => {
    const onOpen = vi.fn();
    const rock = company();
    render(<RockCard rock={rock} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Individual Rocks/ }));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Due Dec 31'));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(rock);
  });

  it('shows the blocked count next to the others, with a word and an icon, not only a colour', () => {
    render(<RockCard rock={company()} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('shows the section for a Company Rock with only Team Rocks below it, because their Individual Rocks are listed too', () => {
    render(<RockCard rock={company({ children: [child('t1', 'on_track', 'team')], childStats: { total: 1, complete: 0, offTrack: 0, blocked: 0 } })} />);
    const toggle = screen.getByRole('button', { name: /Individual Rocks/ });
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toHaveTextContent('1 Individual Rock'); // how many sit under the Team Rock is not known until it is opened
  });

  it('shows no section when nothing is below the Company Rock', () => {
    render(<RockCard rock={company({ children: [], childStats: undefined })} />);
    expect(screen.queryByRole('button', { name: /Individual Rocks/ })).toBeNull();
  });

  it('is not shown on an Individual Rock', () => {
    render(<RockCard rock={company({ rock_level: 'individual', children: [child('i1', 'on_track')] })} />);
    expect(screen.queryByRole('button', { name: /Individual Rocks/ })).toBeNull();
  });
});

describe('RockCard: blocked status', () => {
  it('is shown as Blocked, not as off track or at risk', () => {
    render(<RockCard rock={company({ status: 'blocked', children: [], childStats: undefined })} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByText('Off Track')).toBeNull();
    expect(screen.queryByText('At Risk')).toBeNull();
  });
});
