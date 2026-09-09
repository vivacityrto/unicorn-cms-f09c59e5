import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  getTenantRole,
  hasTenantAccess,
  hasTenantAdmin,
  isSuperAdmin,
  type TenantMembership,
} from '@/auth/access';

interface UserProfile {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member'
    | 'Integrator' | 'BGT' | 'CSC' | 'CET'
    | 'Admin' | 'User' | 'Academy User';
  global_role: 'SuperAdmin' | null;
  superadmin_level: 'Administrator' | 'Team Leader' | 'General' | 'Assistant' | null;
  tenant_id: number | null;
  avatar_url: string | null;
  job_title: string | null;
  is_vivacity_internal: boolean | null;
  is_team: boolean | null;
  kpi_role: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  memberships: TenantMembership[];
  loading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Helper functions for RBAC
  isSuperAdmin: () => boolean;
  hasTenantAccess: (tenantId: number) => boolean;
  hasTenantAdmin: (tenantId: number) => boolean;
  getTenantRole: (tenantId: number) => 'Admin' | 'General User' | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch user profile with setTimeout to avoid deadlock
          setTimeout(() => {
            fetchUserProfile(session.user.id);
            fetchMemberships(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setProfileError(null);
          setMemberships([]);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserProfile(session.user.id);
        fetchMemberships(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, email, first_name, last_name, unicorn_role, global_role, superadmin_level, tenant_id, avatar_url, job_title, is_vivacity_internal, is_team, kpi_role')
        .eq('user_uuid', userId)
        .maybeSingle();

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
      console.error('Error fetching user profile:', error);
      setProfileError('We could not load your account profile. Please try again.');
    }
  };

  const fetchMemberships = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('tenant_members')
        .select('tenant_id, role, status')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching memberships:', error);
        return;
      }
      
      setMemberships((data || []) as TenantMembership[]);
    } catch (error) {
      console.error('Error fetching memberships:', error);
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
      await fetchUserProfile(user.id);
      await fetchMemberships(user.id);
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
