import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  loadUserProfile: vi.fn(),
  loadTenantMemberships: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
      signOut: mocks.signOut,
    },
  },
}));

vi.mock("@/auth/loaders", () => ({
  loadUserProfile: mocks.loadUserProfile,
  loadTenantMemberships: mocks.loadTenantMemberships,
}));

import { useAuthSession } from "@/auth/session";

type AuthCallback = (event: string, session: unknown) => void;

function makeSession(userId: string | null) {
  return userId ? { user: { id: userId } } : null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useAuthSession", () => {
  let authCallback: AuthCallback;
  const onSignedOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onAuthStateChange.mockImplementation((cb: AuthCallback) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.loadTenantMemberships.mockResolvedValue({ data: [], error: null });
  });

  it("fetches profile on initial load", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: makeSession("user-1") } });
    mocks.loadUserProfile.mockResolvedValue({ data: { user_uuid: "user-1" }, error: null });

    const { result } = renderHook(() => useAuthSession(onSignedOut));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.profile).toEqual({ user_uuid: "user-1" });
    expect(mocks.loadUserProfile).toHaveBeenCalledWith("user-1");
  });

  it("does not clear profile to null for a same-user auth event (e.g. a silent token refresh)", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: makeSession("user-1") } });
    mocks.loadUserProfile.mockResolvedValue({ data: { user_uuid: "user-1", first_name: "First" }, error: null });

    const { result } = renderHook(() => useAuthSession(onSignedOut));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.profile).toEqual({ user_uuid: "user-1", first_name: "First" });

    // Simulate a slow-resolving refresh so we can observe the profile value
    // *while the refetch is still in flight* -- this is exactly the window
    // where the old code showed a "Loading..." full-screen flash.
    const refreshedProfile = deferred<{ data: unknown; error: null }>();
    mocks.loadUserProfile.mockReturnValueOnce(refreshedProfile.promise);

    act(() => {
      authCallback("TOKEN_REFRESHED", makeSession("user-1"));
    });
    // Flush the setTimeout(..., 0) the hook uses before calling loadUserProfile.
    await act(async () => {
      await Promise.resolve();
    });

    // Still the old profile -- not cleared to null while the background
    // refresh is pending.
    expect(result.current.profile).toEqual({ user_uuid: "user-1", first_name: "First" });

    await act(async () => {
      refreshedProfile.resolve({ data: { user_uuid: "user-1", first_name: "Updated" }, error: null });
      await Promise.resolve();
    });

    expect(result.current.profile).toEqual({ user_uuid: "user-1", first_name: "Updated" });
  });

  it("clears profile when the signed-in user actually changes", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: makeSession("user-1") } });
    mocks.loadUserProfile.mockResolvedValue({ data: { user_uuid: "user-1" }, error: null });

    const { result } = renderHook(() => useAuthSession(onSignedOut));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.profile).toEqual({ user_uuid: "user-1" });

    const newUserProfile = deferred<{ data: unknown; error: null }>();
    mocks.loadUserProfile.mockReturnValueOnce(newUserProfile.promise);

    act(() => {
      authCallback("SIGNED_IN", makeSession("user-2"));
    });

    // Cleared synchronously with the auth event, before the new fetch
    // resolves -- this is a genuine identity change, not a token refresh.
    expect(result.current.profile).toBeNull();

    await act(async () => {
      newUserProfile.resolve({ data: { user_uuid: "user-2" }, error: null });
      await Promise.resolve();
    });
    expect(result.current.profile).toEqual({ user_uuid: "user-2" });
  });

  it("clears profile on sign-out", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: makeSession("user-1") } });
    mocks.loadUserProfile.mockResolvedValue({ data: { user_uuid: "user-1" }, error: null });

    const { result } = renderHook(() => useAuthSession(onSignedOut));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.profile).toEqual({ user_uuid: "user-1" });

    act(() => {
      authCallback("SIGNED_OUT", null);
    });

    expect(result.current.profile).toBeNull();
  });
});
