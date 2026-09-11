import { useRef, useState } from 'react';

type SegmentCommand = {
  mutateAsync: () => Promise<unknown>;
};

type UseLiveMeetingSegmentNavigationOptions = {
  segmentsFetching: boolean;
  advanceSegment: SegmentCommand;
  goToPreviousSegment: SegmentCommand;
  setViewingSegmentId: (segmentId: string | null) => void;
  broadcastChange: (event: 'segment_change') => void | Promise<void>;
};

/**
 * Keeps facilitator segment navigation throttled and coordinates the local
 * viewer state and attendee broadcast after a command succeeds.
 */
export const useLiveMeetingSegmentNavigation = ({
  segmentsFetching,
  advanceSegment,
  goToPreviousSegment,
  setViewingSegmentId,
  broadcastChange,
}: UseLiveMeetingSegmentNavigationOptions) => {
  const isNavigatingRef = useRef(false);
  const [isNavigatingUI, setIsNavigatingUI] = useState(false);

  const handleAdvanceSegment = async () => {
    if (isNavigatingRef.current || segmentsFetching) return;
    isNavigatingRef.current = true;
    setIsNavigatingUI(true);
    try {
      await advanceSegment.mutateAsync();
      setViewingSegmentId(null);
      broadcastChange('segment_change');
    } finally {
      setTimeout(() => {
        isNavigatingRef.current = false;
        setIsNavigatingUI(false);
      }, 1000);
    }
  };

  const handlePreviousSegment = async () => {
    if (isNavigatingRef.current || segmentsFetching) return;
    isNavigatingRef.current = true;
    setIsNavigatingUI(true);
    try {
      await goToPreviousSegment.mutateAsync();
      setViewingSegmentId(null);
      broadcastChange('segment_change');
    } finally {
      setTimeout(() => {
        isNavigatingRef.current = false;
        setIsNavigatingUI(false);
      }, 1000);
    }
  };

  return { isNavigatingUI, handleAdvanceSegment, handlePreviousSegment };
};
