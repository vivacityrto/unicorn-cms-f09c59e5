import { useEffect, useMemo, useState } from 'react';

import type { EosMeetingSegment } from '@/types/eos';

/**
 * Keeps the facilitator's server-controlled segment separate from each
 * attendee's local browsing position during a live meeting.
 *
 * The returned local state is deliberately never persisted or broadcast.
 */
export const useLiveMeetingViewingState = (
  segments: EosMeetingSegment[] | undefined,
) => {
  // liveSegment = server state, facilitator-controlled - this is what's
  // officially running, unchanged from before this split.
  const liveSegment = useMemo(
    () => segments?.find((segment) => segment.started_at && !segment.completed_at),
    [segments],
  );

  // viewingSegment = local/client-only, per-user, never written to the DB.
  // Defaults to following live (viewingSegmentId === null). Set by clicking
  // any segment in the sidebar - segment content is already loaded
  // client-side, so this never touches the network.
  const [viewingSegmentId, setViewingSegmentId] = useState<string | null>(null);
  const viewingSegment = useMemo(
    () => (viewingSegmentId ? segments?.find((segment) => segment.id === viewingSegmentId) : liveSegment),
    [viewingSegmentId, segments, liveSegment],
  );
  const isViewingLive = viewingSegmentId === null || viewingSegmentId === liveSegment?.id;

  // Tracks the live segment as of the last moment this viewer was actually
  // following it, so the jump-to-live nudge can tell "the facilitator
  // advanced while I was browsing elsewhere" apart from "I just clicked to
  // browse away from an unchanged live position" - the latter isn't the
  // facilitator moving anywhere and shouldn't say so.
  const [lastSeenLiveSegmentId, setLastSeenLiveSegmentId] = useState<string | null>(null);
  useEffect(() => {
    if (isViewingLive) {
      setLastSeenLiveSegmentId(liveSegment?.id ?? null);
    }
  }, [isViewingLive, liveSegment?.id]);
  const facilitatorAdvancedWhileBrowsing =
    !isViewingLive && !!liveSegment && liveSegment.id !== lastSeenLiveSegmentId;

  return {
    liveSegment,
    viewingSegment,
    viewingSegmentId,
    setViewingSegmentId,
    isViewingLive,
    facilitatorAdvancedWhileBrowsing,
  };
};
