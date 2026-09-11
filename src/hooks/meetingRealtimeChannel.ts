import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface OnlineUser {
  user_id: string;
  name: string;
  avatar_url?: string;
  online_at: string;
}

export interface MeetingRealtimeCallbacks {
  onSegmentChange?: (payload: unknown) => void;
  onHeadlineChange?: (payload: unknown) => void;
  onTodoChange?: (payload: unknown) => void;
  onSegueChange?: (payload: unknown) => void;
  onIssueChange?: (payload: unknown) => void;
  onOnePhraseCloseChange?: (payload: unknown) => void;
  onPresenceChange?: (payload: OnlineUser[]) => void;
}

interface MeetingRealtimeUserInfo {
  userId?: string;
  userName?: string;
  avatarUrl?: string;
}

interface CreateMeetingRealtimeChannelOptions {
  meetingId: string;
  getCallbacks: () => MeetingRealtimeCallbacks;
  getUserInfo: () => MeetingRealtimeUserInfo;
  onPresenceSync: (users: OnlineUser[]) => void;
}

export const createMeetingRealtimeChannel = ({
  meetingId,
  getCallbacks,
  getUserInfo,
  onPresenceSync,
}: CreateMeetingRealtimeChannelOptions): RealtimeChannel => {
  const meetingChannel = supabase.channel(`meeting:${meetingId}`, {
    config: {
      presence: {
        key: meetingId,
      },
    },
  });

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
        getCallbacks().onSegmentChange?.(payload);
      },
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
        getCallbacks().onHeadlineChange?.(payload);
      },
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
        getCallbacks().onTodoChange?.(payload);
      },
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
        getCallbacks().onSegueChange?.(payload);
      },
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
        getCallbacks().onIssueChange?.(payload);
      },
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
        getCallbacks().onOnePhraseCloseChange?.(payload);
      },
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
      getCallbacks().onSegmentChange?.(payload);
    })
    .on('broadcast', { event: 'headline_change' }, ({ payload }) => {
      getCallbacks().onHeadlineChange?.(payload);
    })
    .on('broadcast', { event: 'todo_change' }, ({ payload }) => {
      getCallbacks().onTodoChange?.(payload);
    })
    .on('broadcast', { event: 'segue_change' }, ({ payload }) => {
      getCallbacks().onSegueChange?.(payload);
    })
    .on('broadcast', { event: 'issue_change' }, ({ payload }) => {
      getCallbacks().onIssueChange?.(payload);
    })
    .on('broadcast', { event: 'one_phrase_close_change' }, ({ payload }) => {
      getCallbacks().onOnePhraseCloseChange?.(payload);
    })
    .on('presence', { event: 'sync' }, () => {
      const state = meetingChannel.presenceState();
      const rawUsers = Object.values(state).flat() as unknown as OnlineUser[];
      onPresenceSync(rawUsers);
      getCallbacks().onPresenceChange?.(rawUsers);
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      console.log('User joined:', newPresences);
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      console.log('User left:', leftPresences);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const { userId, userName, avatarUrl } = getUserInfo();
        await meetingChannel.track({
          user_id: userId || 'anonymous',
          name: userName || 'Anonymous',
          avatar_url: avatarUrl || null,
          online_at: new Date().toISOString(),
        });
      }
    });

  return meetingChannel;
};
