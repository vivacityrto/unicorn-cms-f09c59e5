import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeOptions {
  meetingId: string;
  onSegmentChange?: (payload: any) => void;
  onHeadlineChange?: (payload: any) => void;
  onTodoChange?: (payload: any) => void;
  onPresenceChange?: (payload: any) => void;
}

export const useMeetingRealtime = ({
  meetingId,
  onSegmentChange,
  onHeadlineChange,
  onTodoChange,
  onPresenceChange,
}: UseRealtimeOptions) => {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  
  // Use refs for callbacks to avoid re-subscribing on every render
  const callbacksRef = useRef({ onSegmentChange, onHeadlineChange, onTodoChange, onPresenceChange });
  callbacksRef.current = { onSegmentChange, onHeadlineChange, onTodoChange, onPresenceChange };

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
        const users = Object.values(state).flat();
        setOnlineUsers(users);
        callbacksRef.current.onPresenceChange?.(users);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await meetingChannel.track({
            online_at: new Date().toISOString(),
          });
        }
      });

    setChannel(meetingChannel);

    return () => {
      meetingChannel.unsubscribe();
    };
  }, [meetingId]); // Only re-subscribe when meetingId changes

  const updatePresence = async (data: any) => {
    if (channel) {
      await channel.track(data);
    }
  };

  return { channel, onlineUsers, updatePresence };
};
