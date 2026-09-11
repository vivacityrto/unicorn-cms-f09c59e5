import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { channel, supabase } = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    presenceState: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn(),
    unsubscribe: vi.fn(),
  };
  channel.on.mockImplementation(() => channel);
  channel.subscribe.mockReturnValue(channel);
  channel.track.mockResolvedValue(undefined);
  channel.presenceState.mockReturnValue({});
  channel.unsubscribe.mockResolvedValue(undefined);
  return { channel, supabase: { channel: vi.fn(() => channel) } };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase }));

import { createMeetingRealtimeChannel } from '@/hooks/meetingRealtimeChannel';
import { useMeetingRealtime } from '@/hooks/useMeetingRealtime';

const createCallbacks = () => ({
  onSegmentChange: vi.fn(),
  onHeadlineChange: vi.fn(),
  onTodoChange: vi.fn(),
  onSegueChange: vi.fn(),
  onIssueChange: vi.fn(),
  onOnePhraseCloseChange: vi.fn(),
  onPresenceChange: vi.fn(),
});

describe('createMeetingRealtimeChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channel.on.mockImplementation(() => channel);
    channel.subscribe.mockReturnValue(channel);
    channel.track.mockResolvedValue(undefined);
    channel.presenceState.mockReturnValue({});
    channel.unsubscribe.mockResolvedValue(undefined);
    supabase.channel.mockReturnValue(channel);
  });

  it('creates the meeting channel and registers every realtime event family', async () => {
    const callbacks = createCallbacks();
    const onPresenceSync = vi.fn();

    createMeetingRealtimeChannel({
      meetingId: 'meeting-1',
      getCallbacks: () => callbacks,
      getUserInfo: () => ({ userId: 'user-1', userName: 'Alex', avatarUrl: 'avatar.png' }),
      onPresenceSync,
    });

    expect(supabase.channel).toHaveBeenCalledWith('meeting:meeting-1', {
      config: { presence: { key: 'meeting-1' } },
    });

    const postgresCalls = channel.on.mock.calls.filter(([kind]) => kind === 'postgres_changes');
    expect(postgresCalls.map(([, filter]) => filter.table)).toEqual([
      'eos_meeting_segments',
      'eos_headlines',
      'eos_todos',
      'eos_segue_shares',
      'eos_issues',
      'eos_meeting_one_phrase_closes',
    ]);
    expect(postgresCalls.every(([, filter]) => filter.filter === 'meeting_id=eq.meeting-1')).toBe(true);

    const broadcasts = channel.on.mock.calls
      .filter(([kind]) => kind === 'broadcast')
      .map(([, filter]) => filter.event);
    expect(broadcasts).toEqual([
      'segment_change',
      'headline_change',
      'todo_change',
      'segue_change',
      'issue_change',
      'one_phrase_close_change',
    ]);
    expect(channel.on.mock.calls.filter(([kind]) => kind === 'presence').map(([, filter]) => filter.event)).toEqual([
      'sync',
      'join',
      'leave',
    ]);

    const subscribe = channel.subscribe.mock.calls[0][0] as (status: string) => Promise<void>;
    await subscribe('SUBSCRIBED');
    expect(channel.track).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      name: 'Alex',
      avatar_url: 'avatar.png',
    }));
  });

  it('dispatches database, broadcast, and presence events through current callbacks', () => {
    const callbacks = createCallbacks();
    const onPresenceSync = vi.fn();
    const onlineUsers = [{ user_id: 'user-2', name: 'Sam', online_at: 'now' }];
    channel.presenceState.mockReturnValue({ meeting: onlineUsers });

    createMeetingRealtimeChannel({
      meetingId: 'meeting-1',
      getCallbacks: () => callbacks,
      getUserInfo: () => ({}),
      onPresenceSync,
    });

    const postgresCalls = channel.on.mock.calls.filter(([kind]) => kind === 'postgres_changes');
    postgresCalls.forEach(([, , handler], index) => handler({ id: index }));
    expect(callbacks.onSegmentChange).toHaveBeenCalledWith({ id: 0 });
    expect(callbacks.onHeadlineChange).toHaveBeenCalledWith({ id: 1 });
    expect(callbacks.onTodoChange).toHaveBeenCalledWith({ id: 2 });
    expect(callbacks.onSegueChange).toHaveBeenCalledWith({ id: 3 });
    expect(callbacks.onIssueChange).toHaveBeenCalledWith({ id: 4 });
    expect(callbacks.onOnePhraseCloseChange).toHaveBeenCalledWith({ id: 5 });

    const broadcastCalls = channel.on.mock.calls.filter(([kind]) => kind === 'broadcast');
    broadcastCalls.forEach(([, , handler], index) => handler({ payload: { id: index } }));
    expect(callbacks.onSegmentChange).toHaveBeenCalledWith({ id: 0 });
    expect(callbacks.onHeadlineChange).toHaveBeenCalledWith({ id: 1 });
    expect(callbacks.onTodoChange).toHaveBeenCalledWith({ id: 2 });
    expect(callbacks.onSegueChange).toHaveBeenCalledWith({ id: 3 });
    expect(callbacks.onIssueChange).toHaveBeenCalledWith({ id: 4 });
    expect(callbacks.onOnePhraseCloseChange).toHaveBeenCalledWith({ id: 5 });

    const presenceSync = channel.on.mock.calls.find(([, filter]) => filter.event === 'sync')?.[2] as () => void;
    presenceSync();
    expect(onPresenceSync).toHaveBeenCalledWith(onlineUsers);
    expect(callbacks.onPresenceChange).toHaveBeenCalledWith(onlineUsers);
  });

  it('leaves channel cleanup with the hook owner', () => {
    const { unmount } = renderHook(() => useMeetingRealtime({
      meetingId: 'meeting-1',
      userId: 'user-1',
      userName: 'Alex',
    }));

    unmount();
    expect(channel.unsubscribe).toHaveBeenCalledOnce();
  });
});
