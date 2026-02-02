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
  onSegmentChange?: (payload: any) => void;
  onHeadlineChange?: (payload: any) => void;
  onTodoChange?: (payload: any) => void;
  onPresenceChange?: (payload: any) => void;
}

export const useMeetingRealtime = ({
  meetingId,
  userId,
  userName,
  avatarUrl,
  onSegmentChange,
  onHeadlineChange,
  onTodoChange,
  onPresenceChange,
}: UseRealtimeOptions) => {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  
  // Use refs for callbacks to avoid re-subscribing on every render
  const callbacksRef = useRef({ onSegmentChange, onHeadlineChange, onTodoChange, onPresenceChange });
  callbacksRef.current = { onSegmentChange, onHeadlineChange, onTodoChange, onPresenceChange };

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

  return { channel, onlineUsers, updatePresence };
};
