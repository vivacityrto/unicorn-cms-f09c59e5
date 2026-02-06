import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import type { TenantType } from "@/contexts/TenantTypeContext";

interface PreviewTenant {
  id: number;
  name: string;
  tenant_type: TenantType;
  academy_max_users: number | null;
}

interface ClientPreviewContextValue {
  // State
  isPreviewMode: boolean;
  previewTenant: PreviewTenant | null;
  previewSessionId: string | null;
  previewReason: string | null;
  loading: boolean;
  
  // Actions
  startPreview: (tenantId: number, reason?: string) => Promise<boolean>;
  endPreview: () => Promise<void>;
  canUsePreview: boolean;
}

const ClientPreviewContext = createContext<ClientPreviewContextValue | undefined>(undefined);

// Session storage key for persisting preview state across page navigations
const PREVIEW_SESSION_KEY = "client_preview_session";

interface StoredPreviewSession {
  sessionId: string;
  tenantId: number;
  tenantName: string;
  tenantType: TenantType;
  academyMaxUsers: number | null;
  reason: string | null;
  startedAt: string;
}

export const ClientPreviewProvider = ({ children }: { children: ReactNode }) => {
  const { profile, session } = useAuth();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewTenant, setPreviewTenant] = useState<PreviewTenant | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewReason, setPreviewReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only Super Admin and Team Leader can use preview
  const isTeamLeader = profile?.unicorn_role === "Team Leader";
  const canUsePreview = isSuperAdmin || isTeamLeader;

  // Restore preview session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (stored && canUsePreview) {
      try {
        const session: StoredPreviewSession = JSON.parse(stored);
        setIsPreviewMode(true);
        setPreviewTenant({
          id: session.tenantId,
          name: session.tenantName,
          tenant_type: session.tenantType,
          academy_max_users: session.academyMaxUsers,
        });
        setPreviewSessionId(session.sessionId);
        setPreviewReason(session.reason);
      } catch (e) {
        console.error("Error restoring preview session:", e);
        sessionStorage.removeItem(PREVIEW_SESSION_KEY);
      }
    }
  }, [canUsePreview]);

  /**
   * Start impersonating a client tenant
   */
  const startPreview = useCallback(async (tenantId: number, reason?: string): Promise<boolean> => {
    if (!canUsePreview || !session?.user?.id) {
      console.error("User cannot use preview mode");
      return false;
    }

    setLoading(true);
    try {
      // Fetch tenant details
      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("id, name, tenant_type, academy_max_users")
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenantData) {
        console.error("Error fetching tenant:", tenantError);
        return false;
      }

      // Create audit log entry
      const { data: auditData, error: auditError } = await supabase
        .from("audit_client_impersonation")
        .insert({
          actor_user_id: session.user.id,
          tenant_id: tenantId,
          reason: reason || null,
        })
        .select("id")
        .single();

      if (auditError) {
        console.error("Error creating audit log:", auditError);
        return false;
      }

      const previewState: StoredPreviewSession = {
        sessionId: auditData.id,
        tenantId: tenantData.id,
        tenantName: tenantData.name,
        tenantType: (tenantData.tenant_type as TenantType) || "compliance_system",
        academyMaxUsers: tenantData.academy_max_users,
        reason: reason || null,
        startedAt: new Date().toISOString(),
      };

      // Store in sessionStorage
      sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(previewState));

      // Update state
      setIsPreviewMode(true);
      setPreviewTenant({
        id: tenantData.id,
        name: tenantData.name,
        tenant_type: previewState.tenantType,
        academy_max_users: tenantData.academy_max_users,
      });
      setPreviewSessionId(auditData.id);
      setPreviewReason(reason || null);

      return true;
    } catch (error) {
      console.error("Error starting preview:", error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [canUsePreview, session?.user?.id]);

  /**
   * End the preview session
   */
  const endPreview = useCallback(async () => {
    if (!previewSessionId) {
      // Just clear state if no session ID
      setIsPreviewMode(false);
      setPreviewTenant(null);
      setPreviewSessionId(null);
      setPreviewReason(null);
      sessionStorage.removeItem(PREVIEW_SESSION_KEY);
      return;
    }

    setLoading(true);
    try {
      // Update audit log with ended_at timestamp
      await supabase
        .from("audit_client_impersonation")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", previewSessionId);
    } catch (error) {
      console.error("Error updating audit log:", error);
    } finally {
      // Clear state regardless of audit update success
      setIsPreviewMode(false);
      setPreviewTenant(null);
      setPreviewSessionId(null);
      setPreviewReason(null);
      sessionStorage.removeItem(PREVIEW_SESSION_KEY);
      setLoading(false);
    }
  }, [previewSessionId]);

  return (
    <ClientPreviewContext.Provider
      value={{
        isPreviewMode,
        previewTenant,
        previewSessionId,
        previewReason,
        loading,
        startPreview,
        endPreview,
        canUsePreview,
      }}
    >
      {children}
    </ClientPreviewContext.Provider>
  );
};

export const useClientPreview = () => {
  const context = useContext(ClientPreviewContext);
  if (context === undefined) {
    throw new Error("useClientPreview must be used within a ClientPreviewProvider");
  }
  return context;
};
