import { useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { loadTenantMemberships, loadUserProfile } from '@/auth/loaders';
import type { TenantMembership, UserProfile } from '@/auth/types';

export interface AuthSessionState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  profileError: string | null;
  memberships: TenantMembership[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

/**
 * Owns the Supabase session lifecycle: the auth-state subscription, session
 * bootstrap, and profile/membership fetch orchestration with generation/
 * mounted staleness guards. Extracted from useAuth.tsx (P7-D) so the React
 * context wrapper stays a thin RBAC layer over this seam. `onSignedOut` lets
 * the caller own post-sign-out navigation instead of this hook depending on
 * the router.
 */
export function useAuthSession(onSignedOut: () => void): AuthSessionState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const authGenerationRef = useRef(0);
  // Tracks the signed-in user id we last cleared/fetched profile+memberships
  // for, so a same-user auth event (a silent token refresh, USER_UPDATED,
  // etc.) can refresh in the background instead of clearing profile to null
  // first -- ProtectedRoute full-screen-gates on `!profile`, so clearing it
  // for every auth event (not just a real sign-in/sign-out/user-change)
  // unmounted the whole page and lost any in-progress form on every silent
  // token refresh.
  const lastUserIdRef = useRef<string | null>(null);

  const fetchUserProfile = async (userId: string, generation: number) => {
    setProfileError(null);
    try {
      const { data, error } = await loadUserProfile(userId);

      if (!mountedRef.current || generation !== authGenerationRef.current) return;
      if (error) {
        console.error('Error fetching user profile:', error);
        setProfileError('We could not load your account profile. Please try again.');
        return;
      }

      if (!data) {
        console.warn('No user profile found for user:', userId);
        setProfileError('Your account profile is not available. Please contact support if this continues.');
        return;
      }

      setProfile(data as UserProfile);
    } catch (error) {
      if (!mountedRef.current || generation !== authGenerationRef.current) return;
      console.error('Error fetching user profile:', error);
      setProfileError('We could not load your account profile. Please try again.');
    }
  };

  const fetchMemberships = async (userId: string, generation: number) => {
    try {
      const { data, error } = await loadTenantMemberships(userId);

      if (!mountedRef.current || generation !== authGenerationRef.current) return;
      if (error) {
        console.error('Error fetching memberships:', error);
        setMemberships([]);
        return;
      }

      setMemberships(data);
    } catch (error) {
      if (!mountedRef.current || generation !== authGenerationRef.current) return;
      console.error('Error fetching memberships:', error);
      setMemberships([]);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        const nextUserId = session?.user?.id ?? null;
        const identityChanged = nextUserId !== lastUserIdRef.current;
        lastUserIdRef.current = nextUserId;

        if (identityChanged) {
          const generation = ++authGenerationRef.current;
          setProfile(null);
          setProfileError(null);
          setMemberships([]);

          if (session?.user) {
            // Fetch user profile with setTimeout to avoid deadlock
            setTimeout(() => {
              if (!mountedRef.current || generation !== authGenerationRef.current) return;
              fetchUserProfile(session.user.id, generation);
              fetchMemberships(session.user.id, generation);
            }, 0);
          } else {
            setLoading(false);
          }
        } else if (session?.user) {
          // Same signed-in user (e.g. a silent token refresh, or
          // USER_UPDATED) -- keep the existing profile/memberships visible
          // and refresh them in the background rather than clearing first.
          const generation = authGenerationRef.current;
          setTimeout(() => {
            if (!mountedRef.current || generation !== authGenerationRef.current) return;
            fetchUserProfile(session.user.id, generation);
            fetchMemberships(session.user.id, generation);
          }, 0);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      lastUserIdRef.current = session?.user?.id ?? null;

      const generation = ++authGenerationRef.current;
      setProfile(null);
      setProfileError(null);
      setMemberships([]);
      if (session?.user) {
        fetchUserProfile(session.user.id, generation);
        fetchMemberships(session.user.id, generation);
      }
      setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      authGenerationRef.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    lastUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileError(null);
    setMemberships([]);
    onSignedOut();
  };

  const refreshProfile = async () => {
    if (user) {
      const generation = authGenerationRef.current;
      await fetchUserProfile(user.id, generation);
      await fetchMemberships(user.id, generation);
    }
  };

  return { user, session, profile, profileError, memberships, loading, signOut, refreshProfile };
}
