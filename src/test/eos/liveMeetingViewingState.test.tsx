import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLiveMeetingViewingState } from '@/hooks/useLiveMeetingViewingState';
import type { EosMeetingSegment } from '@/types/eos';

const makeSegment = (
  id: string,
  overrides: Partial<EosMeetingSegment> = {},
): EosMeetingSegment => ({
  id,
  meeting_id: 'meeting-1',
  segment_name: id,
  sequence_order: Number(id.replace('segment-', '')) || 1,
  duration_minutes: 15,
  started_at: null,
  completed_at: null,
  notes: null,
  segment_type: 'general',
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const liveSegments = () => [
  makeSegment('segment-1', { started_at: '2026-01-01T01:00:00.000Z' }),
  makeSegment('segment-2'),
];

describe('useLiveMeetingViewingState', () => {
  it('follows the live segment by default', () => {
    const { result } = renderHook(({ segments }) => useLiveMeetingViewingState(segments), {
      initialProps: { segments: liveSegments() },
    });

    expect(result.current.liveSegment?.id).toBe('segment-1');
    expect(result.current.viewingSegment?.id).toBe('segment-1');
    expect(result.current.isViewingLive).toBe(true);
    expect(result.current.facilitatorAdvancedWhileBrowsing).toBe(false);
  });

  it('keeps a viewer on a browsed segment and nudges after a remote facilitator advance', () => {
    const { result, rerender } = renderHook(
      ({ segments }) => useLiveMeetingViewingState(segments),
      { initialProps: { segments: liveSegments() } },
    );

    act(() => result.current.setViewingSegmentId('segment-2'));
    expect(result.current.viewingSegment?.id).toBe('segment-2');
    expect(result.current.facilitatorAdvancedWhileBrowsing).toBe(false);

    rerender({
      segments: [
        makeSegment('segment-1', {
          started_at: '2026-01-01T01:00:00.000Z',
          completed_at: '2026-01-01T01:15:00.000Z',
        }),
        makeSegment('segment-2'),
        makeSegment('segment-3', { started_at: '2026-01-01T01:15:00.000Z' }),
      ],
    });

    expect(result.current.liveSegment?.id).toBe('segment-3');
    expect(result.current.viewingSegment?.id).toBe('segment-2');
    expect(result.current.facilitatorAdvancedWhileBrowsing).toBe(true);
  });

  it('does not show a nudge when a viewer browses without a live change', () => {
    const { result, rerender } = renderHook(
      ({ segments }) => useLiveMeetingViewingState(segments),
      { initialProps: { segments: liveSegments() } },
    );

    act(() => result.current.setViewingSegmentId('segment-2'));
    rerender({ segments: liveSegments() });

    expect(result.current.liveSegment?.id).toBe('segment-1');
    expect(result.current.facilitatorAdvancedWhileBrowsing).toBe(false);
  });

  it('returns to live and clears the nudge when the viewer jumps to live', () => {
    const { result, rerender } = renderHook(
      ({ segments }) => useLiveMeetingViewingState(segments),
      { initialProps: { segments: liveSegments() } },
    );

    act(() => result.current.setViewingSegmentId('segment-2'));
    rerender({
      segments: [
        makeSegment('segment-1', {
          started_at: '2026-01-01T01:00:00.000Z',
          completed_at: '2026-01-01T01:15:00.000Z',
        }),
        makeSegment('segment-2'),
        makeSegment('segment-3', { started_at: '2026-01-01T01:15:00.000Z' }),
      ],
    });
    expect(result.current.facilitatorAdvancedWhileBrowsing).toBe(true);

    act(() => result.current.setViewingSegmentId(null));

    expect(result.current.viewingSegment?.id).toBe('segment-3');
    expect(result.current.isViewingLive).toBe(true);
    expect(result.current.facilitatorAdvancedWhileBrowsing).toBe(false);
  });
});
