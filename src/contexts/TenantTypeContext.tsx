import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Tenant type definitions
export type TenantType =
  | "compliance_system"
  | "academy_solo"
  | "academy_team"
  | "academy_elite";

export type AcademyTier = "solo" | "team" | "elite";

interface TenantTypeContextValue {
  tenantType: TenantType | null;
  tenantId: number | null;
  isComplianceMember: boolean;
  isAcademyMember: boolean;
  academyTier: AcademyTier | null;
  academyMaxUsers: number | null;
  loading: boolean;
  refreshTenantType: () => Promise<void>;
}

const TenantTypeContext = createContext<TenantTypeContextValue | undefined>(
  undefined
);

export const TenantTypeProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { profile, memberships } = useAuth();
  const [tenantType, setTenantType] = useState<TenantType | null>(null);
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [academyMaxUsers, setAcademyMaxUsers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTenantType = async () => {
    // For Vivacity Team members, they don't have a tenant type restriction
    const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member"].includes(
      profile?.unicorn_role || ""
    );

    if (isVivacityTeam) {
      // Vivacity team gets full compliance access
      setTenantType("compliance_system");
      setTenantId(6372); // Vivacity system tenant
      setAcademyMaxUsers(null);
      setLoading(false);
      return;
    }

    // For client users, get their primary tenant's type
    const primaryTenantId = profile?.tenant_id || memberships[0]?.tenant_id;

    if (!primaryTenantId) {
      setTenantType(null);
      setTenantId(null);
      setLoading(false);
      return;
    }

    setTenantId(primaryTenantId);

    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("tenant_type, academy_max_users")
        .eq("id", primaryTenantId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching tenant type:", error);
        setTenantType(null);
      } else if (data) {
        setTenantType((data.tenant_type as TenantType) || "compliance_system");
        setAcademyMaxUsers(data.academy_max_users);
      }
    } catch (error) {
      console.error("Error fetching tenant type:", error);
      setTenantType(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (profile) {
      fetchTenantType();
    } else {
      setTenantType(null);
      setLoading(false);
    }
  }, [profile, memberships]);

  const isComplianceMember = useMemo(() => {
    return tenantType === "compliance_system";
  }, [tenantType]);

  const isAcademyMember = useMemo(() => {
    return (
      tenantType === "academy_solo" ||
      tenantType === "academy_team" ||
      tenantType === "academy_elite"
    );
  }, [tenantType]);

  const academyTier = useMemo((): AcademyTier | null => {
    switch (tenantType) {
      case "academy_solo":
        return "solo";
      case "academy_team":
        return "team";
      case "academy_elite":
        return "elite";
      default:
        return null;
    }
  }, [tenantType]);

  const refreshTenantType = async () => {
    setLoading(true);
    await fetchTenantType();
  };

  return (
    <TenantTypeContext.Provider
      value={{
        tenantType,
        tenantId,
        isComplianceMember,
        isAcademyMember,
        academyTier,
        academyMaxUsers,
        loading,
        refreshTenantType,
      }}
    >
      {children}
    </TenantTypeContext.Provider>
  );
};

export const useTenantType = () => {
  const context = useContext(TenantTypeContext);
  if (context === undefined) {
    throw new Error("useTenantType must be used within a TenantTypeProvider");
  }
  return context;
};
