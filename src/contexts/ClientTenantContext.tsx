import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { supabase } from "@/integrations/supabase/client";

interface TenantUserRow {
  tenant_id: number;
  access_scope: string;
  primary_contact: boolean | null;
  secondary_contact: boolean;
}

interface ClientTenantContextValue {
  activeTenantId: number | null;
  tenantName: string | null;
  logoUrl: string | null;
  isPreview: boolean;
  isReadOnly: boolean;
  academyAccessEnabled: boolean;
  academyAccessLoading: boolean;
  tenantUser: TenantUserRow | null;
  tenantUserLoading: boolean;
  canAccessClientPortal: boolean;
  canManagePortalUsers: boolean;
  isAcademyOnly: boolean;
}

const ClientTenantContext = createContext<ClientTenantContextValue>({
  activeTenantId: null,
  tenantName: null,
  logoUrl: null,
  isPreview: false,
  isReadOnly: false,
  academyAccessEnabled: false,
  academyAccessLoading: true,
  tenantUser: null,
  tenantUserLoading: true,
  canAccessClientPortal: false,
  canManagePortalUsers: false,
  isAcademyOnly: false,
});

export function ClientTenantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { isPreviewMode, previewTenant } = useClientPreview();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [academyAccessEnabled, setAcademyAccessEnabled] = useState(false);
  const [academyAccessLoading, setAcademyAccessLoading] = useState(true);
  const [resolvedTenantId, setResolvedTenantId] = useState<number | null>(null);
  const [tenantUser, setTenantUser] = useState<TenantUserRow | null>(null);
  const [tenantUserLoading, setTenantUserLoading] = useState(true);

  const isPreview = isPreviewMode && !!previewTenant;

  // Resilient tenant resolution: prefer users.tenant_id; otherwise fall back to a
  // single tenant_users row. If 0 or 2+ rows exist with no users.tenant_id, leave
  // null and warn — we don't silently pick for multi-tenant users.
  useEffect(() => {
    if (isPreview) {
      setResolvedTenantId(previewTenant!.id);
      return;
    }
    if (!profile?.user_uuid) {
      setResolvedTenantId(null);
      return;
    }
    if (profile.tenant_id) {
      setResolvedTenantId(profile.tenant_id);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("tenant_id")
        .eq("user_id", profile.user_uuid);
      if (cancelled) return;
      if (error) {
        console.warn("[ClientTenantContext] tenant_users lookup failed", error);
        setResolvedTenantId(null);
        return;
      }
      if (!data || data.length === 0) {
        setResolvedTenantId(null);
        return;
      }
      if (data.length > 1) {
        console.warn(
          `[ClientTenantContext] User ${profile.user_uuid} has ${data.length} tenant_users rows and no users.tenant_id — refusing to pick. Multi-tenant selection UI required.`
        );
        setResolvedTenantId(null);
        return;
      }
      setResolvedTenantId(Number(data[0].tenant_id));
    })();
    return () => {
      cancelled = true;
    };
  }, [isPreview, previewTenant, profile?.user_uuid, profile?.tenant_id]);

  const activeTenantId = resolvedTenantId;
  const tenantName = isPreview ? previewTenant!.name : null;

  // Fetch tenant logo + academy access
  useEffect(() => {
    if (!activeTenantId) {
      setLogoUrl(null);
      setAcademyAccessEnabled(false);
      // Only mark as not-loading once tenant resolution has settled with no tenant.
      // If profile is still loading, keep loading=true.
      if (profile?.user_uuid && resolvedTenantId === null && !isPreview) {
        setAcademyAccessLoading(false);
      }
      return;
    }
    setAcademyAccessLoading(true);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tenants")
        .select("logo_path, academy_access_enabled")
        .eq("id", activeTenantId)
        .single();
      if (cancelled) return;
      if (data?.logo_path) {
        const { data: urlData } = supabase.storage
          .from("client-logos")
          .getPublicUrl(data.logo_path);
        setLogoUrl(urlData?.publicUrl || null);
      } else {
        setLogoUrl(null);
      }
      setAcademyAccessEnabled(data?.academy_access_enabled ?? false);
      setAcademyAccessLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTenantId, profile?.user_uuid, resolvedTenantId, isPreview]);

  // Fetch caller's tenant_users row for the active tenant
  useEffect(() => {
    if (!profile?.user_uuid || !activeTenantId) {
      setTenantUser(null);
      setTenantUserLoading(!!profile?.user_uuid && !activeTenantId);
      return;
    }
    let cancelled = false;
    setTenantUserLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("tenant_id, access_scope, primary_contact, secondary_contact")
        .eq("user_id", profile.user_uuid)
        .eq("tenant_id", activeTenantId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[ClientTenantContext] tenant_user fetch failed", error);
        setTenantUser(null);
      } else {
        setTenantUser((data as TenantUserRow | null) ?? null);
      }
      setTenantUserLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.user_uuid, activeTenantId]);

  const { canAccessClientPortal, canManagePortalUsers, isAcademyOnly } = useMemo(() => {
    if (!tenantUser) {
      return { canAccessClientPortal: false, canManagePortalUsers: false, isAcademyOnly: false };
    }
    const isContact = tenantUser.primary_contact === true || tenantUser.secondary_contact === true;
    const fullScope = tenantUser.access_scope === "full";
    return {
      // Backup-admin model: BOTH primary and secondary manage users.
      // Narrowing to secondary-only would regress today's primary-contact UX.
      canAccessClientPortal: fullScope && isContact,
      canManagePortalUsers: fullScope && isContact,
      isAcademyOnly: tenantUser.access_scope === "academy_only",
    };
  }, [tenantUser]);

  return (
    <ClientTenantContext.Provider
      value={{
        activeTenantId,
        tenantName,
        logoUrl,
        isPreview,
        isReadOnly: isPreview,
        academyAccessEnabled,
        academyAccessLoading,
        tenantUser,
        tenantUserLoading,
        canAccessClientPortal,
        canManagePortalUsers,
        isAcademyOnly,
      }}
    >
      {children}
    </ClientTenantContext.Provider>
  );
}

export function useClientTenant() {
  return useContext(ClientTenantContext);
}
