import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  users: [] as Array<Record<string, unknown>>,
  userQueries: [] as string[][],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => state.rpc(...args),
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          state.userQueries.push(ids);
          return Promise.resolve({ data: state.users.filter((u) => ids.includes(u.user_uuid as string)), error: null });
        },
      }),
    }),
  },
}));

import { displayName, fetchSenderProfiles } from './conversationSenders';

beforeEach(() => {
  state.rpc.mockReset();
  state.users = [];
  state.userQueries = [];
});

describe('displayName', () => {
  it('joins first and last name, trims blanks and falls back', () => {
    expect(displayName({ first_name: 'Nova', last_name: 'Canto' }, 'Vivacity Team')).toBe('Nova Canto');
    expect(displayName({ first_name: 'Nova', last_name: null }, 'Vivacity Team')).toBe('Nova');
    expect(displayName({ first_name: ' ', last_name: '' }, 'Vivacity Team')).toBe('Vivacity Team');
    expect(displayName(null, 'Unknown')).toBe('Unknown');
  });
});

describe('fetchSenderProfiles', () => {
  it('uses the conversation function, so staff a client cannot read directly still have a name and picture', async () => {
    state.rpc.mockResolvedValue({ data: [{ user_uuid: 'staff1', first_name: 'Nova', last_name: 'Canto', avatar_url: 'https://x/a.png', is_staff: true }], error: null });
    const map = await fetchSenderProfiles('conv1', ['staff1', 'staff1']);
    expect(state.rpc).toHaveBeenCalledWith('get_conversation_sender_profiles', { p_conversation_id: 'conv1' });
    expect(map.get('staff1')).toEqual({ user_uuid: 'staff1', first_name: 'Nova', last_name: 'Canto', avatar_url: 'https://x/a.png', is_staff: true });
    expect(state.userQueries).toEqual([]);
  });

  it('falls back to the direct lookup when the function is not there or fails, only for the people it missed', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    state.users = [{ user_uuid: 'a', first_name: 'Ana', last_name: 'Ng', avatar_url: null }];
    const map = await fetchSenderProfiles('conv1', ['a', 'b']);
    expect(state.userQueries).toEqual([['a', 'b']]);
    expect(map.get('a')?.first_name).toBe('Ana');
    // The direct lookup cannot tell whether someone is staff, so it says unknown, never false or true.
    expect(map.get('a')?.is_staff).toBeNull();
    expect(map.has('b')).toBe(false);
  });

  it('survives the function throwing, and asks for nothing when there are no senders', async () => {
    state.rpc.mockRejectedValue(new Error('network'));
    state.users = [{ user_uuid: 'a', first_name: 'Ana', last_name: null, avatar_url: null }];
    expect((await fetchSenderProfiles('conv1', ['a'])).get('a')?.first_name).toBe('Ana');
    state.rpc.mockClear();
    expect((await fetchSenderProfiles('conv1', [])).size).toBe(0);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('fills the gaps: a person the function missed is looked up directly', async () => {
    state.rpc.mockResolvedValue({ data: [{ user_uuid: 'staff1', first_name: 'Nova', last_name: 'Canto', avatar_url: null, is_staff: true }], error: null });
    state.users = [{ user_uuid: 'me', first_name: 'Carl', last_name: 'S', avatar_url: null }];
    const map = await fetchSenderProfiles('conv1', ['staff1', 'me']);
    expect(state.userQueries).toEqual([['me']]);
    expect(map.get('me')?.first_name).toBe('Carl');
    expect(map.get('staff1')?.is_staff).toBe(true);
  });
});
