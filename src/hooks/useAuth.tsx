import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthSession } from '@/auth/session';
import type { AuthContextValue, TenantMembership } from '@/auth/types';
import {
  getTenantRole,
  hasTenantAccess,
  hasTenantAdmin,
  isSuperAdmin,
} from '@/auth/access';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const {
    user,
    session,
    profile,
    profileError,
    memberships,
    loading,
    signOut,
    refreshProfile,
  } = useAuthSession(() => navigate('/login'));

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
