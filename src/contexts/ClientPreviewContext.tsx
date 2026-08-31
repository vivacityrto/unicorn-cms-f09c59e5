import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import type { TenantType } from "@/contexts/TenantTypeContext";
import { isVivacityStaffRole } from "@/lib/roles/vivacityRoles";

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
  isPreviewMode: boolean;
  previewTenant: PreviewTenant | null;
  previewSessionId: string | null;
  previewReason: string | null;
  loading: boolean;
  actingUserId: string | null;
  actingUserOptions: ActingUserOption[];
  returnPath: string | null;

  startPreview: (tenantId: number, reason?: string, actingUserId?: string | null, returnPath?: string | null) => Promise<boolean>;
  endPreview: () => Promise<void>;
  setActingUserId: (uuid: string | null) => void;
  fetchActingUserOptions: (tenantId: number) => Promise<ActingUserOption[]>;
  canUsePreview: boolean;
}

const ClientPreviewContext = createContext<ClientPreviewContextValue | undefined>(undefined);

const PREVIEW_SESSION_KEY = "client_preview_session";
// Cross-tab handoff mirror. sessionStorage is per-tab, so opening Academy
// (or any other surface) in a new tab would otherwise lose the preview and
// silently fall back to the real staff identity. localStorage is shared
// across tabs in the same origin/profile, so a new tab can hydrate from it.
const PREVIEW_HANDOFF_KEY = "client_preview_handoff";
// Cap how long a stale handoff may live in localStorage. Prevents preview
// from resurrecting after a browser restart hours/days later.
const HANDOFF_MAX_AGE_MS = 12 * 60 * 60 * 1000;

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
  // Staff auth.users.id that started the preview. Used to refuse handoff
  // restore for any other authenticated user on the same browser.
  ownerUserId: string;
  returnPath: string | null;
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

function writePreviewState(s: StoredPreviewSession) {
  const json = JSON.stringify(s);
  sessionStorage.setItem(PREVIEW_SESSION_KEY, json);
  try {
    localStorage.setItem(PREVIEW_HANDOFF_KEY, json);
  } catch {
    /* localStorage may be unavailable (private mode); per-tab still works */
  }
}

function clearPreviewState() {
  sessionStorage.removeItem(PREVIEW_SESSION_KEY);
  try {
    localStorage.removeItem(PREVIEW_HANDOFF_KEY);
  } catch {
    /* noop */
  }
}

export const ClientPreviewProvider = ({ children }: { children: ReactNode }) => {
  const { profile, session } = useAuth();
  const { isSuperAdmin } = useRBAC();
  const queryClient = useQueryClient();

  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewTenant, setPreviewTenant] = useState<PreviewTenant | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewReason, setPreviewReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingUserId, setActingUserIdState] = useState<string | null>(null);
  const [actingUserOptions, setActingUserOptions] = useState<ActingUserOption[]>([]);
  const [returnPath, setReturnPath] = useState<string | null>(null);

  const isTeamLeader = isVivacityStaffRole(profile?.unicorn_role);
  const canUsePreview = isSuperAdmin || isTeamLeader;
  const authUserId = session?.user?.id ?? null;

  // Restore preview session. Prefer per-tab sessionStorage; fall back to
  // cross-tab localStorage handoff so a tab opened from a preview tab
  // (e.g. Vivacity Academy) continues the same preview.
  useEffect(() => {
    if (!canUsePreview || !authUserId) return;

    const sessionRaw = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    let s: StoredPreviewSession | null = null;
    let fromHandoff = false;

    if (sessionRaw) {
      try {
        s = JSON.parse(sessionRaw) as StoredPreviewSession;
      } catch {
        sessionStorage.removeItem(PREVIEW_SESSION_KEY);
        s = null;
      }
    }

    if (!s) {
      try {
        const handoffRaw = localStorage.getItem(PREVIEW_HANDOFF_KEY);
        if (handoffRaw) {
          const parsed = JSON.parse(handoffRaw) as StoredPreviewSession;
          // Refuse handoff that does not belong to the current staff user
          // (covers logout/login or a different staff member on the same
          // machine). Refuse stale handoff older than the age cap.
          const owner = parsed.ownerUserId;
          const age = parsed.startedAt
            ? Date.now() - Date.parse(parsed.startedAt)
            : Number.POSITIVE_INFINITY;
          if (owner === authUserId && Number.isFinite(age) && age < HANDOFF_MAX_AGE_MS) {
            s = parsed;
            fromHandoff = true;
          } else {
            try { localStorage.removeItem(PREVIEW_HANDOFF_KEY); } catch { /* noop */ }
          }
        }
      } catch (e) {
        console.error("Error reading preview handoff:", e);
      }
    }

    if (!s) return;

    try {
      const opts = s.actingUserOptions ?? [];
      // BUG-024: if stored acting user is no longer in the filtered options,
      // clear it silently. Prevents stale/ghost identity on reload.
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
      setReturnPath(s.returnPath ?? null);

      // Always normalize storage so this tab now has a per-tab primary,
      // and the cross-tab mirror reflects the validated state.
      const normalized: StoredPreviewSession = {
        ...s,
        actingUserId: validActingId,
        actingUserOptions: opts,
        ownerUserId: s.ownerUserId ?? authUserId,
      };
      if (fromHandoff || validActingId !== s.actingUserId || !s.ownerUserId) {
        writePreviewState(normalized);
      }
    } catch (e) {
      console.error("Error restoring preview session:", e);
      clearPreviewState();
    }
  }, [canUsePreview, authUserId]);

  // Cross-tab sync: when another tab clears the handoff (endPreview) or
  // changes the acting user, mirror that locally so all preview tabs stay
  // consistent. Never write audit rows from this listener — the originating
  // tab already did that.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== PREVIEW_HANDOFF_KEY) return;
      if (e.newValue == null) {
        // Another tab ended preview. Local cleanup only.
        setIsPreviewMode(false);
        setPreviewTenant(null);
        setPreviewSessionId(null);
        setPreviewReason(null);
        setActingUserIdState(null);
        setActingUserOptions([]);
        sessionStorage.removeItem(PREVIEW_SESSION_KEY);
        queryClient.invalidateQueries();
        return;
      }
      try {
        const s = JSON.parse(e.newValue) as StoredPreviewSession;
        if (!authUserId || s.ownerUserId !== authUserId) return;
        // Sync acting user changes from sibling tabs (picker change).
        const opts = s.actingUserOptions ?? [];
        const validActingId =
          s.actingUserId && opts.some((o) => o.user_uuid === s.actingUserId)
            ? s.actingUserId
            : null;
        setActingUserIdState(validActingId);
        setActingUserOptions(opts);
        // Keep per-tab primary in sync too.
        sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify({
          ...s,
          actingUserId: validActingId,
          actingUserOptions: opts,
        }));
        queryClient.invalidateQueries();
      } catch {
        /* ignore malformed handoff payloads */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [authUserId, queryClient]);

  const setActingUserId = useCallback((uuid: string | null) => {
    setActingUserIdState(uuid);
    const stored = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (stored) {
      try {
        const parsed: StoredPreviewSession = JSON.parse(stored);
        parsed.actingUserId = uuid;
        writePreviewState(parsed);
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
    async (tenantId: number, reason?: string, initialActingUserId?: string | null, returnPathArg?: string | null): Promise<boolean> => {
      if (!canUsePreview || !session?.user?.id) {
        console.error("User cannot use preview mode");
        return false;
      }

      setLoading(true);
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

        let opts: ActingUserOption[] = [];
        try {
          opts = await loadActingUserOptions(tenantId);
        } catch (optsError) {
          console.error("Error loading acting user options:", optsError);
          opts = [];
        }
        const resolvedActingId =
          initialActingUserId ??
          opts.find((o) => o.is_default)?.user_uuid ??
          opts[0]?.user_uuid ??
          null;

        const { data: auditData, error: auditError } = await supabase
          .from("audit_client_impersonation")
          .insert({
            actor_user_id: session.user.id,
            tenant_id: tenantId,
            reason: reason || null,
            acting_user_id: resolvedActingId,
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
          actingUserId: resolvedActingId,
          actingUserOptions: opts,
          ownerUserId: session.user.id,
          returnPath: returnPathArg ?? null,
        };

        writePreviewState(previewState);

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
        setReturnPath(returnPathArg ?? null);

        queryClient.invalidateQueries();

        return true;
      } catch (error) {
        console.error("Error starting preview:", error);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [canUsePreview, session?.user?.id, queryClient]
  );

  const endPreview = useCallback(async () => {
    const cleanup = () => {
      setIsPreviewMode(false);
      setPreviewTenant(null);
      setPreviewSessionId(null);
      setPreviewReason(null);
      setActingUserIdState(null);
      setActingUserOptions([]);
      setReturnPath(null);
      clearPreviewState();
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
        returnPath,
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
