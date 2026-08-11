import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { supabase } from "@/integrations/supabase/client";

interface TenantUserRow {
  tenant_id: number;
  access_scope: string;
  relationship_role:
    | 'primary_contact'
    | 'secondary_contact'
    | 'user'
    | 'academy_user'
    | null;
}

interface ClientTenantContextValue {
  activeTenantId: number | null;
  tenantName: string | null;
  logoUrl: string | null;
  unicorn1Id: number | null;
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
  unicorn1Id: null,
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
  const { isPreviewMode, previewTenant, actingUserId, actingUserOptions } = useClientPreview();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [fetchedTenantName, setFetchedTenantName] = useState<string | null>(null);
  const [unicorn1Id, setUnicorn1Id] = useState<number | null>(null);
  const [academyAccessEnabled, setAcademyAccessEnabled] = useState(false);
  const [academyAccessLoading, setAcademyAccessLoading] = useState(true);
  const [resolvedTenantId, setResolvedTenantId] = useState<number | null>(null);
  const [resolutionAttempted, setResolutionAttempted] = useState(false);
  const [tenantUser, setTenantUser] = useState<TenantUserRow | null>(null);
  const [tenantUserLoading, setTenantUserLoading] = useState(true);

  const isPreview = isPreviewMode && !!previewTenant;

  // Resilient tenant resolution: prefer users.tenant_id; otherwise fall back to a
  // single tenant_users row. If 0 or 2+ rows exist with no users.tenant_id, leave
  // null and warn — we don't silently pick for multi-tenant users.
  useEffect(() => {
    if (isPreview) {
      setResolvedTenantId(previewTenant!.id);
      setResolutionAttempted(true);
      return;
    }
    if (!profile?.user_uuid) {
      setResolvedTenantId(null);
      // Profile not loaded yet — resolution not attempted; do NOT mark settled.
      return;
    }
    if (profile.tenant_id) {
      setResolvedTenantId(profile.tenant_id);
      setResolutionAttempted(true);
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
        setResolutionAttempted(true);
        return;
      }
      if (!data || data.length === 0) {
        setResolvedTenantId(null);
        setResolutionAttempted(true);
        return;
      }
      if (data.length > 1) {
        console.warn(
          `[ClientTenantContext] User ${profile.user_uuid} has ${data.length} tenant_users rows and no users.tenant_id — refusing to pick. Multi-tenant selection UI required.`
        );
        setResolvedTenantId(null);
        setResolutionAttempted(true);
        return;
      }
      setResolvedTenantId(Number(data[0].tenant_id));
      setResolutionAttempted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isPreview, previewTenant, profile?.user_uuid, profile?.tenant_id]);

  const activeTenantId = resolvedTenantId;
  const tenantName = isPreview ? previewTenant!.name : fetchedTenantName;

  // Fetch tenant name + logo + academy access. The loading flag tracks ONLY
  // this fetch lifecycle (decoupled from how activeTenantId was resolved).
  useEffect(() => {
    if (activeTenantId == null) {
      setLogoUrl(null);
      setFetchedTenantName(null);
      setUnicorn1Id(null);
      setAcademyAccessEnabled(false);
      // Only flip loading=false once tenant resolution has settled with no tenant.
      if (resolutionAttempted) {
        setAcademyAccessLoading(false);
      }
      return;
    }
    setAcademyAccessLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("tenants")
          .select("name, logo_path, academy_access_enabled, unicorn1_id")
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
        setFetchedTenantName(data?.name ?? null);
        setAcademyAccessEnabled(data?.academy_access_enabled ?? false);
        setUnicorn1Id(data?.unicorn1_id ?? null);
      } catch (err) {
        if (!cancelled) {
          console.warn("[ClientTenantContext] tenants fetch failed", err);
          setFetchedTenantName(null);
          setAcademyAccessEnabled(false);
          setUnicorn1Id(null);
        }
      } finally {
        if (!cancelled) setAcademyAccessLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTenantId, resolutionAttempted]);

  // Watchdog: if tenant resolution hangs > 5s with no activeTenantId, surface
  // the not-active state instead of an infinite spinner.
  useEffect(() => {
    if (!academyAccessLoading || activeTenantId != null) return;
    const t = setTimeout(() => {
      console.warn(
        "[ClientTenantContext] tenant resolution exceeded 5s — surfacing not-active state"
      );
      setAcademyAccessLoading(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [academyAccessLoading, activeTenantId]);

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
        .select("tenant_id, access_scope, relationship_role")
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

  const previewActingRole = isPreview
    ? actingUserOptions.find(o => o.user_uuid === actingUserId)?.relationship_role ?? null
    : null;

  const { canAccessClientPortal, canManagePortalUsers, isAcademyOnly } = useMemo(() => {
    if (isPreview) {
      const isContact =
        previewActingRole === 'primary_contact' ||
        previewActingRole === 'secondary_contact';
      const fullScope = previewActingRole !== 'academy_user';
      return {
        canAccessClientPortal: fullScope && (isContact || previewActingRole === 'user'),
        canManagePortalUsers: fullScope && isContact,
        isAcademyOnly: !fullScope,
      };
    }
    if (!tenantUser) {
      return { canAccessClientPortal: false, canManagePortalUsers: false, isAcademyOnly: false };
    }
    const isContact =
      tenantUser.relationship_role === 'primary_contact' ||
      tenantUser.relationship_role === 'secondary_contact';
    const fullScope = tenantUser.access_scope === "full";
    return {
      // Backup-admin model: BOTH primary and secondary manage users.
      // Narrowing to secondary-only would regress today's primary-contact UX.
      canAccessClientPortal: fullScope && (isContact || tenantUser.relationship_role === 'user'),
      canManagePortalUsers: fullScope && isContact,
      isAcademyOnly: tenantUser.access_scope === "academy_only",
    };
  }, [tenantUser, isPreview, previewActingRole]);

  return (
    <ClientTenantContext.Provider
      value={{
        activeTenantId,
        tenantName,
        logoUrl,
        unicorn1Id,
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
