import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLiveMeetingSegmentNavigation } from '@/hooks/useLiveMeetingSegmentNavigation';

const createDeferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const renderNavigation = (overrides: Partial<{
  segmentsFetching: boolean;
  advanceSegment: { mutateAsync: () => Promise<unknown> };
  goToPreviousSegment: { mutateAsync: () => Promise<unknown> };
}> = {}) => {
  const setViewingSegmentId = vi.fn();
  const broadcastChange = vi.fn();
  const advanceSegment = overrides.advanceSegment ?? { mutateAsync: vi.fn().mockResolvedValue(undefined) };
  const goToPreviousSegment = overrides.goToPreviousSegment ?? { mutateAsync: vi.fn().mockResolvedValue(undefined) };
  const hook = renderHook(() => useLiveMeetingSegmentNavigation({
    segmentsFetching: overrides.segmentsFetching ?? false,
    advanceSegment,
    goToPreviousSegment,
    setViewingSegmentId,
    broadcastChange,
  }));

  return { ...hook, setViewingSegmentId, broadcastChange, advanceSegment, goToPreviousSegment };
};

describe('useLiveMeetingSegmentNavigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances, returns the facilitator to live, and broadcasts after success', async () => {
    const { result, setViewingSegmentId, broadcastChange, advanceSegment } = renderNavigation();

    await act(async () => {
      await result.current.handleAdvanceSegment();
    });

    expect(advanceSegment.mutateAsync).toHaveBeenCalledOnce();
    expect(setViewingSegmentId).toHaveBeenCalledWith(null);
    expect(broadcastChange).toHaveBeenCalledWith('segment_change');
    expect(result.current.isNavigatingUI).toBe(true);

    act(() => vi.runOnlyPendingTimers());
    expect(result.current.isNavigatingUI).toBe(false);
  });

  it('applies the same contract to returning to the previous segment', async () => {
    const { result, setViewingSegmentId, broadcastChange, goToPreviousSegment } = renderNavigation();

    await act(async () => {
      await result.current.handlePreviousSegment();
    });

    expect(goToPreviousSegment.mutateAsync).toHaveBeenCalledOnce();
    expect(setViewingSegmentId).toHaveBeenCalledWith(null);
    expect(broadcastChange).toHaveBeenCalledWith('segment_change');
  });

  it('ignores commands while segments are fetching or another command is active', async () => {
    const fetching = renderNavigation({ segmentsFetching: true });
    await act(async () => {
      await fetching.result.current.handleAdvanceSegment();
    });
    expect(fetching.advanceSegment.mutateAsync).not.toHaveBeenCalled();

    const deferred = createDeferred();
    const active = renderNavigation({ advanceSegment: { mutateAsync: vi.fn(() => deferred.promise) } });
    let firstCommand: Promise<void> | undefined;
    act(() => {
      firstCommand = active.result.current.handleAdvanceSegment();
    });
    expect(active.result.current.isNavigatingUI).toBe(true);

    await act(async () => {
      await active.result.current.handlePreviousSegment();
    });
    expect(active.goToPreviousSegment.mutateAsync).not.toHaveBeenCalled();

    deferred.resolve();
    await act(async () => {
      await firstCommand;
    });
  });

  it('releases the navigation guard after a failed command without side effects', async () => {
    const error = new Error('RPC failed');
    const { result, setViewingSegmentId, broadcastChange } = renderNavigation({
      advanceSegment: { mutateAsync: vi.fn().mockRejectedValue(error) },
    });

    await act(async () => {
      await expect(result.current.handleAdvanceSegment()).rejects.toThrow('RPC failed');
    });

    expect(setViewingSegmentId).not.toHaveBeenCalled();
    expect(broadcastChange).not.toHaveBeenCalled();
    expect(result.current.isNavigatingUI).toBe(true);

    act(() => vi.runOnlyPendingTimers());
    expect(result.current.isNavigatingUI).toBe(false);
  });
});
