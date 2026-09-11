import { useEffect, useState, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  createMeetingRealtimeChannel,
  type MeetingRealtimeCallbacks,
  type OnlineUser,
} from '@/hooks/meetingRealtimeChannel';

export type { OnlineUser } from '@/hooks/meetingRealtimeChannel';

interface UseRealtimeOptions {
  meetingId: string;
  userId?: string;
  userName?: string;
  avatarUrl?: string;
  onSegmentChange?: MeetingRealtimeCallbacks['onSegmentChange'];
  onHeadlineChange?: MeetingRealtimeCallbacks['onHeadlineChange'];
  onTodoChange?: MeetingRealtimeCallbacks['onTodoChange'];
  onSegueChange?: MeetingRealtimeCallbacks['onSegueChange'];
  onIssueChange?: MeetingRealtimeCallbacks['onIssueChange'];
  onOnePhraseCloseChange?: MeetingRealtimeCallbacks['onOnePhraseCloseChange'];
  onPresenceChange?: MeetingRealtimeCallbacks['onPresenceChange'];
}

export const useMeetingRealtime = ({
  meetingId,
  userId,
  userName,
  avatarUrl,
  onSegmentChange,
  onHeadlineChange,
  onTodoChange,
  onSegueChange,
  onIssueChange,
  onOnePhraseCloseChange,
  onPresenceChange,
}: UseRealtimeOptions) => {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  // Use refs for callbacks to avoid re-subscribing on every render
  const callbacksRef = useRef({ onSegmentChange, onHeadlineChange, onTodoChange, onSegueChange, onIssueChange, onOnePhraseCloseChange, onPresenceChange });
  callbacksRef.current = { onSegmentChange, onHeadlineChange, onTodoChange, onSegueChange, onIssueChange, onOnePhraseCloseChange, onPresenceChange };

  // Store user info in ref to avoid re-subscribing when it changes
  const userInfoRef = useRef({ userId, userName, avatarUrl });
  userInfoRef.current = { userId, userName, avatarUrl };

  useEffect(() => {
    if (!meetingId) return;

    const meetingChannel = createMeetingRealtimeChannel({
      meetingId,
      getCallbacks: () => callbacksRef.current,
      getUserInfo: () => userInfoRef.current,
      onPresenceSync: setOnlineUsers,
    });

    setChannel(meetingChannel);

    return () => {
      meetingChannel.unsubscribe();
    };
  }, [meetingId]); // Only re-subscribe when meetingId changes

  const updatePresence = async (data: Partial<OnlineUser>) => {
    if (channel) {
      const { userId, userName, avatarUrl } = userInfoRef.current;
      await channel.track({
        user_id: userId || 'anonymous',
        name: userName || 'Anonymous',
        avatar_url: avatarUrl || null,
        online_at: new Date().toISOString(),
        ...data,
      });
    }
  };

  // See the broadcast fallback comment above - call this after a mutation
  // that changes segments/headlines/todos/issues succeeds, so other
  // attendees' .on('broadcast', ...) listeners pick it up instead of
  // relying on the still-registered-but-non-functional postgres_changes
  // path.
  const broadcastChange = async (event: 'segment_change' | 'headline_change' | 'todo_change' | 'segue_change' | 'issue_change' | 'one_phrase_close_change') => {
    if (channel) {
      await channel.send({ type: 'broadcast', event, payload: {} });
    }
  };

  return { channel, onlineUsers, updatePresence, broadcastChange };
};
