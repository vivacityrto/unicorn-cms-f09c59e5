import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface OnlineUser {
  user_id: string;
  name: string;
  avatar_url?: string;
  online_at: string;
}

interface UseRealtimeOptions {
  meetingId: string;
  userId?: string;
  userName?: string;
  avatarUrl?: string;
  onSegmentChange?: (payload: unknown) => void;
  onHeadlineChange?: (payload: unknown) => void;
  onTodoChange?: (payload: unknown) => void;
  onSegueChange?: (payload: unknown) => void;
  onIssueChange?: (payload: unknown) => void;
  onOnePhraseCloseChange?: (payload: unknown) => void;
  onPresenceChange?: (payload: OnlineUser[]) => void;
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

    const meetingChannel = supabase.channel(`meeting:${meetingId}`, {
      config: {
        presence: {
          key: meetingId,
        },
      },
    });

    // Subscribe to segment changes
    meetingChannel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eos_meeting_segments',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          callbacksRef.current.onSegmentChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eos_headlines',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          callbacksRef.current.onHeadlineChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eos_todos',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          callbacksRef.current.onTodoChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eos_segue_shares',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          callbacksRef.current.onSegueChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eos_issues',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          callbacksRef.current.onIssueChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eos_meeting_one_phrase_closes',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          callbacksRef.current.onOnePhraseCloseChange?.(payload);
        }
      )
      // Broadcast fallback: postgres_changes subscriptions for this project
      // never actually register server-side (confirmed live 2026-07-24 -
      // zero rows in realtime.subscription for eos_meeting_segments/
      // eos_headlines/eos_todos despite an actively-joined channel with
      // working presence), so no attendee ever receives a DB-driven change
      // event. Presence on this same channel does work, so the mutating
      // client now also broadcasts its own change directly over the
      // channel - every other attendee's listener below reruns the same
      // callback the postgres_changes handler above would have. Both stay
      // wired in case Supabase's registration issue is fixed later.
      .on('broadcast', { event: 'segment_change' }, ({ payload }) => {
        callbacksRef.current.onSegmentChange?.(payload);
      })
      .on('broadcast', { event: 'headline_change' }, ({ payload }) => {
        callbacksRef.current.onHeadlineChange?.(payload);
      })
      .on('broadcast', { event: 'todo_change' }, ({ payload }) => {
        callbacksRef.current.onTodoChange?.(payload);
      })
      .on('broadcast', { event: 'segue_change' }, ({ payload }) => {
        callbacksRef.current.onSegueChange?.(payload);
      })
      .on('broadcast', { event: 'issue_change' }, ({ payload }) => {
        callbacksRef.current.onIssueChange?.(payload);
      })
      .on('broadcast', { event: 'one_phrase_close_change' }, ({ payload }) => {
        callbacksRef.current.onOnePhraseCloseChange?.(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = meetingChannel.presenceState();
        const rawUsers = Object.values(state).flat() as unknown as OnlineUser[];
        setOnlineUsers(rawUsers);
        callbacksRef.current.onPresenceChange?.(rawUsers);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { userId, userName, avatarUrl } = userInfoRef.current;
          await meetingChannel.track({
            user_id: userId || 'anonymous',
            name: userName || 'Anonymous',
            avatar_url: avatarUrl || null,
            online_at: new Date().toISOString(),
          });
        }
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
