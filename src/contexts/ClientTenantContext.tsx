import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClientPreview } from "@/contexts/ClientPreviewContext";

interface ClientTenantContextValue {
  activeTenantId: number | null;
  tenantName: string | null;
  isPreview: boolean;
  isReadOnly: boolean;
}

const ClientTenantContext = createContext<ClientTenantContextValue>({
  activeTenantId: null,
  tenantName: null,
  isPreview: false,
  isReadOnly: false,
});

export function ClientTenantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { isPreviewMode, previewTenant } = useClientPreview();

  // Preview mode takes precedence (staff viewing as client)
  const isPreview = isPreviewMode && !!previewTenant;
  const activeTenantId = isPreview ? previewTenant!.id : (profile?.tenant_id ?? null);
  const tenantName = isPreview ? previewTenant!.name : null;

  return (
    <ClientTenantContext.Provider
      value={{
        activeTenantId,
        tenantName,
        isPreview,
        isReadOnly: isPreview, // Preview is always read-only
      }}
    >
      {children}
    </ClientTenantContext.Provider>
  );
}

export function useClientTenant() {
  return useContext(ClientTenantContext);
}
