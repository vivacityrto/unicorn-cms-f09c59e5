import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

export interface ActingUserOption {
  user_uuid: string;
  full_name: string;
  email: string;
  relationship_role: string;
  is_default: boolean;
}

interface ClientPreviewContextValue {
  // State
  isPreviewMode: boolean;
  previewTenant: PreviewTenant | null;
  previewSessionId: string | null;
  previewReason: string | null;
  loading: boolean;
  // Acting user (Academy impersonation)
  actingUserId: string | null;
  actingUserOptions: ActingUserOption[];

  // Actions
  startPreview: (tenantId: number, reason?: string, actingUserId?: string | null) => Promise<boolean>;
  endPreview: () => Promise<void>;
  setActingUserId: (uuid: string | null) => void;
  fetchActingUserOptions: (tenantId: number) => Promise<ActingUserOption[]>;
  canUsePreview: boolean;
}

const ClientPreviewContext = createContext<ClientPreviewContextValue | undefined>(undefined);

const PREVIEW_SESSION_KEY = "client_preview_session";

interface StoredPreviewSession {
  sessionId: string;
  tenantId: number;
  tenantName: string;
  tenantType: TenantType;
  academyMaxUsers: number | null;
  reason: string | null;
  startedAt: string;
  actingUserId: string | null;
  actingUserOptions: ActingUserOption[];
}

async function loadActingUserOptions(tenantId: number): Promise<ActingUserOption[]> {
  const { data, error } = await supabase
    .rpc("list_acting_user_options", { p_tenant_id: tenantId });
  if (error) {
    console.error("Failed to fetch acting user options (RPC):", error);
    return [];
  }
  return (data ?? []) as ActingUserOption[];
}

export const ClientPreviewProvider = ({ children }: { children: ReactNode }) => {
  const { profile, session } = useAuth();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const queryClient = useQueryClient();

  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewTenant, setPreviewTenant] = useState<PreviewTenant | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewReason, setPreviewReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingUserId, setActingUserIdState] = useState<string | null>(null);
  const [actingUserOptions, setActingUserOptions] = useState<ActingUserOption[]>([]);

  const isTeamLeader = profile?.unicorn_role === "Team Leader";
  const canUsePreview = isSuperAdmin || isTeamLeader;

  // Restore session
  useEffect(() => {
    const stored = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (stored && canUsePreview) {
      try {
        const s: StoredPreviewSession = JSON.parse(stored);
        const opts = s.actingUserOptions ?? [];
        // Defensive: if the stored acting user is no longer in the filtered
        // options, clear it silently. Prevents stale/ghost identity on reload.
        const validActingId =
          s.actingUserId && opts.some((o) => o.user_uuid === s.actingUserId)
            ? s.actingUserId
            : null;
        setIsPreviewMode(true);
        setPreviewTenant({
          id: s.tenantId,
          name: s.tenantName,
          tenant_type: s.tenantType,
          academy_max_users: s.academyMaxUsers,
        });
        setPreviewSessionId(s.sessionId);
        setPreviewReason(s.reason);
        setActingUserIdState(validActingId);
        setActingUserOptions(opts);
        if (validActingId !== s.actingUserId) {
          sessionStorage.setItem(
            PREVIEW_SESSION_KEY,
            JSON.stringify({ ...s, actingUserId: validActingId, actingUserOptions: opts })
          );
        }
      } catch (e) {
        console.error("Error restoring preview session:", e);
        sessionStorage.removeItem(PREVIEW_SESSION_KEY);
      }
    }
  }, [canUsePreview]);

  const persistSession = useCallback((s: StoredPreviewSession) => {
    sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(s));
  }, []);

  const setActingUserId = useCallback((uuid: string | null) => {
    setActingUserIdState(uuid);
    const stored = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (stored) {
      try {
        const parsed: StoredPreviewSession = JSON.parse(stored);
        parsed.actingUserId = uuid;
        sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(parsed));
      } catch {
        /* noop */
      }
    }
    queryClient.invalidateQueries();
  }, [queryClient]);

  const fetchActingUserOptions = useCallback(async (tenantId: number) => {
    const opts = await loadActingUserOptions(tenantId);
    setActingUserOptions(opts);
    return opts;
  }, []);

  const startPreview = useCallback(
    async (tenantId: number, reason?: string, initialActingUserId?: string | null): Promise<boolean> => {
      if (!canUsePreview || !session?.user?.id) {
        console.error("User cannot use preview mode");
        return false;
      }

      setLoading(true);
      // Defensive: clear any prior tenant's picker state before the
      // async chain runs, so the UI never briefly renders stale options.
      setActingUserOptions([]);
      setActingUserIdState(null);
      try {
        const { data: tenantData, error: tenantError } = await supabase
          .from("tenants")
          .select("id, name, tenant_type, academy_max_users")
          .eq("id", tenantId)
          .single();

        if (tenantError || !tenantData) {
          console.error("Error fetching tenant:", tenantError);
          return false;
        }

        // Audit log
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

        // Always refetch for the impersonated tenant — never seed
        // the picker from stale React state from a prior preview.
        const opts = await loadActingUserOptions(tenantId);
        const resolvedActingId =
          initialActingUserId ??
          opts.find((o) => o.is_default)?.user_uuid ??
          opts[0]?.user_uuid ??
          null;

        const previewState: StoredPreviewSession = {
          sessionId: auditData.id,
          tenantId: tenantData.id,
          tenantName: tenantData.name,
          tenantType: (tenantData.tenant_type as TenantType) || "compliance_system",
          academyMaxUsers: tenantData.academy_max_users,
          reason: reason || null,
          startedAt: new Date().toISOString(),
          actingUserId: resolvedActingId,
          actingUserOptions: opts,
        };

        persistSession(previewState);

        setIsPreviewMode(true);
        setPreviewTenant({
          id: tenantData.id,
          name: tenantData.name,
          tenant_type: previewState.tenantType,
          academy_max_users: tenantData.academy_max_users,
        });
        setPreviewSessionId(auditData.id);
        setPreviewReason(reason || null);
        setActingUserIdState(resolvedActingId);
        setActingUserOptions(opts);

        queryClient.invalidateQueries();

        return true;
      } catch (error) {
        console.error("Error starting preview:", error);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [canUsePreview, session?.user?.id, queryClient, persistSession]
  );

  const endPreview = useCallback(async () => {
    const cleanup = () => {
      setIsPreviewMode(false);
      setPreviewTenant(null);
      setPreviewSessionId(null);
      setPreviewReason(null);
      setActingUserIdState(null);
      setActingUserOptions([]);
      sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    };

    if (!previewSessionId) {
      cleanup();
      return;
    }

    setLoading(true);
    try {
      await supabase
        .from("audit_client_impersonation")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", previewSessionId);
    } catch (error) {
      console.error("Error updating audit log:", error);
    } finally {
      cleanup();
      queryClient.invalidateQueries();
      setLoading(false);
    }
  }, [previewSessionId, queryClient]);

  return (
    <ClientPreviewContext.Provider
      value={{
        isPreviewMode,
        previewTenant,
        previewSessionId,
        previewReason,
        loading,
        actingUserId,
        actingUserOptions,
        startPreview,
        endPreview,
        setActingUserId,
        fetchActingUserOptions,
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
