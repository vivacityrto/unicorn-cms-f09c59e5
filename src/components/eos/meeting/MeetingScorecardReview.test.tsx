import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScorecardMetric } from '@/types/scorecard';
import { lastCompletedWeekKey } from '@/features/eos-scorecard/scorecardView';

const raiseMutate = vi.fn().mockResolvedValue({ id: 'issue-1' });
const saveMutate = vi.fn().mockResolvedValue(undefined);
const recordMutate = vi.fn();
const weekKey = lastCompletedWeekKey();

const metric = (over: Partial<ScorecardMetric>): ScorecardMetric => ({
  id: 'm1', scorecard_id: 's1', tenant_id: 6372, name: 'Quiet RTOs', description: 'RTOs with no client activity.', category: 'CST', owner_id: null,
  target_value: 10, unit: 'Count', direction: 'lower_is_better', frequency: 'weekly', metric_source: 'automatic', metric_key: null,
  example_result: null, is_active: true, is_archived: false, display_order: 0, created_at: '', updated_at: '', recentEntries: [], ...over,
});
const entry = (metric_id: string, value: number) => ({
  id: `e-${metric_id}`, metric_id, tenant_id: 6372, week_ending: weekKey, value, actual_value: value, entered_by: 'u1', entered_at: '', entry_source: 'system' as const,
});

let metrics: ScorecardMetric[] = [];

vi.mock('@/hooks/useScorecardMetrics', () => ({
  useScorecardMetrics: () => ({ metrics, isLoading: false, recordEntry: { mutate: recordMutate } }),
}));
vi.mock('@/features/eos-scorecard/useOwnerNames', () => ({ useOwnerNames: () => ({}) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me', tenant_id: 6372 } }) }));
vi.mock('@/features/eos-scorecard/useScorecardDiscussion', async (importActual) => ({
  ...(await importActual<typeof import('@/features/eos-scorecard/useScorecardDiscussion')>()),
  useMetricIssues: () => ({ data: [], isError: false, isLoading: false }),
  useScorecardNotes: () => ({ data: [] }),
  useSaveScorecardNote: () => ({ mutateAsync: saveMutate, isPending: false }),
  useRaiseScorecardIssue: () => ({ mutateAsync: raiseMutate, isPending: false }),
}));

import { MeetingScorecardReview } from './MeetingScorecardReview';

const meeting = { id: 'meeting-1', segmentId: 'seg-1', type: 'L10', onIssueRaised: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  metrics = [
    metric({ id: 'm1', name: 'Quiet RTOs', recentEntries: [entry('m1', 36)] }),
    metric({ id: 'm2', name: 'Certificates issued', direction: 'higher_is_better', target_value: 3, recentEntries: [entry('m2', 4)] }),
    metric({ id: 'm3', name: 'New leads', category: 'Sales', metric_source: 'manual', target_value: 5, direction: 'higher_is_better', unit: 'Count' }),
  ];
});

describe('MeetingScorecardReview', () => {
  it('leads with one sentence and an area card per area, in plain words', () => {
    render(<MeetingScorecardReview meeting={meeting} />);
    expect(screen.getByText(/1 of 3 measures are on track/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Client engagement' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sales' })).toBeInTheDocument();
    expect(screen.queryByText('CST')).not.toBeInTheDocument();
  });

  it('opens the deck on the chosen area and shows its numbers against the aim', async () => {
    const user = userEvent.setup();
    render(<MeetingScorecardReview meeting={meeting} />);
    await user.click(screen.getAllByRole('button', { name: 'Discuss this area' })[0]);
    const slide = await screen.findByRole('article', { name: 'Area: Client engagement' });
    expect(within(slide).getByText('Quiet RTOs')).toBeInTheDocument();
    expect(within(slide).getAllByText(/10 or fewer/).length).toBeGreaterThan(0);
  });

  it('raises an off-track measure for IDS, linked to the measure and the meeting', async () => {
    const user = userEvent.setup();
    render(<MeetingScorecardReview meeting={meeting} />);
    await user.click(screen.getAllByRole('button', { name: 'Discuss this area' })[0]);
    const slide = await screen.findByRole('article', { name: 'Area: Client engagement' });
    await user.click(within(slide).getByRole('button', { name: 'Raise it for IDS' }));
    await user.click(within(slide).getByRole('button', { name: 'Add to IDS queue' }));
    expect(raiseMutate).toHaveBeenCalledWith(
      expect.objectContaining({ metricId: 'm1', meetingId: 'meeting-1', meetingSegmentId: 'seg-1', meetingType: 'L10', title: expect.stringContaining('Quiet RTOs') }),
    );
    expect(meeting.onIssueRaised).toHaveBeenCalled();
    expect(await within(slide).findByText(/Added to the IDS queue/)).toBeInTheDocument();
  });

  it('saves a note for the area', async () => {
    const user = userEvent.setup();
    render(<MeetingScorecardReview meeting={meeting} />);
    await user.click(screen.getAllByRole('button', { name: 'Discuss this area' })[0]);
    await user.type(await screen.findByRole('textbox', { name: 'Your note for Client engagement' }), 'Call the quietest five this week');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(saveMutate).toHaveBeenCalledWith({ category: 'CST', body: 'Call the quietest five this week' });
  });

  it('lists what still needs raising or noting on the wrap-up', async () => {
    const user = userEvent.setup();
    render(<MeetingScorecardReview meeting={meeting} />);
    await user.click(screen.getByRole('button', { name: 'Discuss the scorecard' }));
    await user.click(await screen.findByRole('button', { name: 'Wrap-up' }));
    const wrap = await screen.findByRole('region', { name: 'Wrap-up' });
    expect(within(wrap).getByText(/Needs the room, and nothing raised or noted/)).toBeInTheDocument();
    expect(within(wrap).getByText('Client engagement')).toBeInTheDocument();
  });

  it('records a missing number for a manual measure', async () => {
    const user = userEvent.setup();
    render(<MeetingScorecardReview meeting={meeting} />);
    const waiting = screen.getByRole('region', { name: 'Waiting for a number' });
    await user.type(within(waiting).getByRole('textbox'), '7');
    await user.click(within(waiting).getByRole('button', { name: /save/i }));
    expect(recordMutate).toHaveBeenCalledWith(expect.objectContaining({ value: 7, weekEnding: weekKey }), expect.anything());
  });
});
