import { useEffect, useState } from 'react';
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
          console.log('Segment changed:', payload);
          onSegmentChange?.(payload);
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
          console.log('Headline changed:', payload);
          onHeadlineChange?.(payload);
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
          console.log('Todo changed:', payload);
          onTodoChange?.(payload);
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = meetingChannel.presenceState();
        const users = Object.values(state).flat();
        setOnlineUsers(users);
        onPresenceChange?.(users);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track current user presence
          await meetingChannel.track({
            online_at: new Date().toISOString(),
          });
        }
      });

    setChannel(meetingChannel);

    return () => {
      meetingChannel.unsubscribe();
    };
  }, [meetingId, onSegmentChange, onHeadlineChange, onTodoChange, onPresenceChange]);

  const updatePresence = async (data: any) => {
    if (channel) {
      await channel.track(data);
    }
  };

  return { channel, onlineUsers, updatePresence };
};
