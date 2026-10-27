import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEosRockOwnerFilter } from '../useEosRockOwnerFilter';

const users = [{ user_uuid: 'user-1' }, { user_uuid: 'user-2' }];

describe('useEosRockOwnerFilter', () => {
  it('defaults to the signed-in user once the staff directory loads', () => {
    const { result, rerender } = renderHook(
      ({ directory }: { directory: typeof users | undefined }) =>
        useEosRockOwnerFilter('user-1', directory),
      { initialProps: { directory: undefined } },
    );

    expect(result.current.filter).toBe('all');

    rerender({ directory: users });

    expect(result.current.filter).toBe('user-1');
  });

  it('keeps an explicit All Users choice when profile or directory data changes', () => {
    const { result, rerender } = renderHook(
      ({ profileUserUuid }: { profileUserUuid: string }) =>
        useEosRockOwnerFilter(profileUserUuid, users),
      { initialProps: { profileUserUuid: 'user-1' } },
    );

    act(() => result.current.setFilter('all'));
    rerender({ profileUserUuid: 'user-2' });

    expect(result.current.filter).toBe('all');
  });

  it('allows selecting another staff member', () => {
    const { result } = renderHook(() =>
      useEosRockOwnerFilter('user-1', users),
    );

    act(() => result.current.setFilter('user-2'));

    expect(result.current.filter).toBe('user-2');
  });
});
