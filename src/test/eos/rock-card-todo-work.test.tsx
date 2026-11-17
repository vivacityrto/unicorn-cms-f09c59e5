import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RockCard } from '@/components/eos/rocks/RockCard';
import type { RockWithHierarchy } from '@/types/eos';
import type { RockWorkSummary } from '@/utils/rockWork';

const rock = (status: string, over: Partial<RockWithHierarchy> = {}): RockWithHierarchy => ({
  id: 'rock-1', tenant_id: 6372, title: 'Re-engage dormant leads', status, quarter_year: 2026, quarter_number: 4,
  due_date: '2026-12-31T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
  rock_level: 'individual',
  // The page's milestone figure, once loaded: none yet for this Rock. Tests for "not loaded" pass `milestoneStats: undefined`.
  milestoneStats: { total: 0, complete: 0 },
  ...over,
} as RockWithHierarchy);

const work = (total: number, done: number, overdue = 0): RockWorkSummary => ({
  total, done, open: total - done, overdue, percent: total ? Math.round((done / total) * 100) : null,
});

describe('RockCard: To-Do roll-up', () => {
  it('shows the Rock\'s linked To-Dos as one figure, with the overdue count', () => {
    render(<RockCard rock={rock('on_track')} todoWork={work(36, 33, 3)} />);
    const line = within(screen.getByLabelText('To-Dos'));
    expect(line.getByText('33/36')).toBeInTheDocument();
    expect(line.getByText('3 overdue')).toBeInTheDocument();
  });

  it('says so when a Complete Rock still has open To-Dos', () => {
    render(<RockCard rock={rock('complete')} todoWork={work(3, 2)} />);
    expect(screen.getByText('This Rock is marked Complete, but 1 linked To-Do is still open.')).toBeInTheDocument();
  });

  it('says so when an On Track Rock has an overdue To-Do', () => {
    render(<RockCard rock={rock('on_track')} todoWork={work(3, 1, 1)} />);
    expect(screen.getByText('This Rock is marked On Track, but 1 linked To-Do is overdue.')).toBeInTheDocument();
  });

  it('asks whether a Rock with no milestones is finished once every To-Do is done, but not when it has milestones', () => {
    const { unmount } = render(<RockCard rock={rock('on_track')} todoWork={work(2, 2)} />);
    expect(screen.getByText('All 2 linked To-Dos are done. If the work is finished, mark the Rock Complete.')).toBeInTheDocument();
    unmount();

    render(<RockCard rock={rock('on_track', { milestoneStats: { total: 3, complete: 1 } } as Partial<RockWithHierarchy>)} todoWork={work(2, 2)} />);
    expect(screen.queryByText(/linked To-Dos are done/)).toBeNull();
    expect(screen.getByLabelText('To-Dos')).toBeInTheDocument();
  });

  it('does not ask whether the Rock is finished, or flag it, while its milestones have not loaded (or failed to load)', () => {
    // `milestoneStats` is absent until the page's milestone query succeeds; without it the card cannot tell "no milestones" from "unknown".
    render(<RockCard rock={rock('on_track', { milestoneStats: undefined })} todoWork={work(2, 2)} />);
    expect(screen.queryByText(/linked To-Dos are done/)).toBeNull();
    expect(within(screen.getByLabelText('To-Dos')).getByText('2/2')).toBeInTheDocument();
  });

  it('holds the other status lines back too until the milestones are known', () => {
    render(<RockCard rock={rock('complete', { milestoneStats: undefined })} todoWork={work(3, 2)} />);
    expect(screen.queryByText(/is marked Complete, but/)).toBeNull();
  });

  it('counts milestones kept on the Rock itself (older Rocks), so it does not ask whether the work is finished', () => {
    const legacy = [{ id: 'x', text: 'Call the leads', completed: false }] as unknown as RockWithHierarchy['milestones'];
    render(<RockCard rock={rock('on_track', { milestones: legacy })} todoWork={work(2, 2)} />);
    expect(screen.queryByText(/linked To-Dos are done/)).toBeNull();
  });

  it('shows nothing until the To-Dos have loaded, and nothing for a Rock with none', () => {
    const { unmount } = render(<RockCard rock={rock('complete')} />);
    expect(screen.queryByLabelText('To-Dos')).toBeNull();
    unmount();

    render(<RockCard rock={rock('complete')} todoWork={work(0, 0)} />);
    expect(screen.queryByLabelText('To-Dos')).toBeNull();
  });
});
