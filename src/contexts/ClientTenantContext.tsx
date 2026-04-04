import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { supabase } from "@/integrations/supabase/client";

interface ClientTenantContextValue {
  activeTenantId: number | null;
  tenantName: string | null;
  logoUrl: string | null;
  isPreview: boolean;
  isReadOnly: boolean;
  academyAccessEnabled: boolean;
}

const ClientTenantContext = createContext<ClientTenantContextValue>({
  activeTenantId: null,
  tenantName: null,
  logoUrl: null,
  isPreview: false,
  isReadOnly: false,
  academyAccessEnabled: false,
});

export function ClientTenantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { isPreviewMode, previewTenant } = useClientPreview();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [academyAccessEnabled, setAcademyAccessEnabled] = useState(false);

  // Preview mode takes precedence (staff viewing as client)
  const isPreview = isPreviewMode && !!previewTenant;
  const activeTenantId = isPreview ? previewTenant!.id : (profile?.tenant_id ?? null);
  const tenantName = isPreview ? previewTenant!.name : null;

  useEffect(() => {
    if (!activeTenantId) { setLogoUrl(null); setAcademyAccessEnabled(false); return; }

    (async () => {
      const { data } = await supabase
        .from("tenants")
        .select("logo_path, academy_access_enabled")
        .eq("id", activeTenantId)
        .single();

      if (data?.logo_path) {
        const { data: urlData } = supabase.storage
          .from("client-logos")
          .getPublicUrl(data.logo_path);
        setLogoUrl(urlData?.publicUrl || null);
      } else {
        setLogoUrl(null);
      }
      setAcademyAccessEnabled(data?.academy_access_enabled ?? false);
    })();
  }, [activeTenantId]);

  return (
    <ClientTenantContext.Provider
      value={{
        activeTenantId,
        tenantName,
        logoUrl,
        isPreview,
        isReadOnly: isPreview,
        academyAccessEnabled,
      }}
    >
      {children}
    </ClientTenantContext.Provider>
  );
}

export function useClientTenant() {
  return useContext(ClientTenantContext);
}
