import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { loadTenantMemberships, loadUserProfile } from '@/auth/loaders';
import type { AuthContextValue, TenantMembership, UserProfile } from '@/auth/types';
import {
  getTenantRole,
  hasTenantAccess,
  hasTenantAdmin,
  isSuperAdmin,
} from '@/auth/access';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const authGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

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
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileError(null);
    setMemberships([]);
    navigate('/login');
  };

  const refreshProfile = async () => {
    if (user) {
      const generation = authGenerationRef.current;
      await fetchUserProfile(user.id, generation);
      await fetchMemberships(user.id, generation);
    }
  };

  // RBAC helper functions
  const isSuperAdminForProfile = (): boolean => isSuperAdmin(profile);
  const hasTenantAccessForProfile = (tenantId: number): boolean => hasTenantAccess(profile, memberships, tenantId);
  const hasTenantAdminForProfile = (tenantId: number): boolean => hasTenantAdmin(profile, memberships, tenantId);
  const getTenantRoleForProfile = (tenantId: number): TenantMembership['role'] | null =>
    getTenantRole(profile, memberships, tenantId);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      profile, 
      profileError,
      memberships,
      loading, 
      signOut, 
      refreshProfile,
      isSuperAdmin: isSuperAdminForProfile,
      hasTenantAccess: hasTenantAccessForProfile,
      hasTenantAdmin: hasTenantAdminForProfile,
      getTenantRole: getTenantRoleForProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
