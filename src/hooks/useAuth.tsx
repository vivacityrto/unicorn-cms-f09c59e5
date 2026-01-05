import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface UserProfile {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User';
  global_role: 'SuperAdmin' | null;
  tenant_id: number | null;
  avatar_url: string | null;
}

// Tenant membership info for RBAC
interface TenantMembership {
  tenant_id: number;
  role: 'Admin' | 'General User';
  status: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  memberships: TenantMembership[];
  loading: boolean;
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
    try {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, email, first_name, last_name, unicorn_role, global_role, tenant_id, avatar_url')
        .eq('user_uuid', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }
      
      if (!data) {
        console.warn('No user profile found for user:', userId);
        return;
      }
      
      setProfile(data as UserProfile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
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
  const isSuperAdmin = (): boolean => {
    return profile?.global_role === 'SuperAdmin';
  };

  const hasTenantAccess = (tenantId: number): boolean => {
    if (isSuperAdmin()) return true;
    return memberships.some(m => m.tenant_id === tenantId && m.status === 'active');
  };

  const hasTenantAdmin = (tenantId: number): boolean => {
    if (isSuperAdmin()) return true;
    return memberships.some(m => m.tenant_id === tenantId && m.role === 'Admin' && m.status === 'active');
  };

  const getTenantRole = (tenantId: number): 'Admin' | 'General User' | null => {
    if (isSuperAdmin()) return 'Admin'; // SuperAdmins have admin access everywhere
    const membership = memberships.find(m => m.tenant_id === tenantId && m.status === 'active');
    return membership?.role || null;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      profile, 
      memberships,
      loading, 
      signOut, 
      refreshProfile,
      isSuperAdmin,
      hasTenantAccess,
      hasTenantAdmin,
      getTenantRole,
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
