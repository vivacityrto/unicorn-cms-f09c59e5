import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { MessengerDockProvider, useMessengerDock } from "@/components/messenger";
import { ASK_VIV_THREAD_ID, HELP_ALIAS_CSC, HELP_ALIAS_SUPPORT } from "@/components/client/clientThreads";

export type HelpCenterTab = "chatbot" | "csc" | "support";

/**
 * The Help Center drawer is retired: Ask Viv, your consultant and support are threads in the messenger bubble. The buttons
 * that used to open it ("Ask Viv", "Message your CSC", "Support", "Get help") still call openHelpCenter, which now opens the
 * bubble on the matching thread, so none of them needed rewriting. canAccess keeps the old rule: only people with a
 * relationship to the organisation get these buttons.
 */
interface HelpCenterContextType {
  isOpen: boolean;
  activeTab: HelpCenterTab;
  openHelpCenter: (tab?: HelpCenterTab) => void;
  closeHelpCenter: () => void;
  setActiveTab: (tab: HelpCenterTab) => void;
  canAccess: boolean;
  accessLoading: boolean;
}

const HelpCenterContext = createContext<HelpCenterContextType | null>(null);

const TAB_THREAD: Record<HelpCenterTab, string> = {
  chatbot: ASK_VIV_THREAD_ID,
  csc: HELP_ALIAS_CSC,
  support: HELP_ALIAS_SUPPORT,
};

function tabFor(selectedId: string | null): HelpCenterTab {
  if (!selectedId || selectedId === ASK_VIV_THREAD_ID) return "chatbot";
  if (selectedId === HELP_ALIAS_SUPPORT || selectedId.startsWith("support:") || selectedId.startsWith("ticket:")) return "support";
  return "csc";
}

function HelpCenterBridge({ canAccess, accessLoading, children }: { canAccess: boolean; accessLoading: boolean; children: ReactNode }) {
  const dock = useMessengerDock();
  const { openDock, closeDock } = dock;

  const openHelpCenter = useCallback(
    (tab: HelpCenterTab = "chatbot") => {
      if (!canAccess) return;
      openDock(TAB_THREAD[tab]);
    },
    [canAccess, openDock],
  );

  const value = useMemo<HelpCenterContextType>(
    () => ({
      isOpen: dock.open,
      activeTab: tabFor(dock.selectedId),
      openHelpCenter,
      closeHelpCenter: closeDock,
      setActiveTab: (tab) => openHelpCenter(tab),
      canAccess,
      accessLoading,
    }),
    [dock.open, dock.selectedId, openHelpCenter, closeDock, canAccess, accessLoading],
  );

  return <HelpCenterContext.Provider value={value}>{children}</HelpCenterContext.Provider>;
}

export function HelpCenterProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { isPreviewMode, actingUserId, actingUserOptions } = useClientPreview();

  const userId = profile?.user_uuid ?? null;
  const tenantId = profile?.tenant_id ?? null;

  const { data: relationshipRole, isLoading: accessLoading } = useQuery({
    queryKey: ["help_center_access", userId, tenantId],
    enabled: !!userId && !!tenantId && !isPreviewMode,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("relationship_role")
        .eq("user_id", userId!)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.relationship_role as string | null) ?? null;
    },
  });

  const previewRelationshipRole =
    isPreviewMode && actingUserId
      ? actingUserOptions.find((o) => o.user_uuid === actingUserId)?.relationship_role ?? null
      : null;

  const effectiveRole = isPreviewMode ? previewRelationshipRole : relationshipRole;
  const effectiveLoading = isPreviewMode ? false : accessLoading;

  const canAccess =
    effectiveRole === "primary_contact" ||
    effectiveRole === "secondary_contact" ||
    effectiveRole === "user";

  // The messenger bubble's open state lives here, so every layout that has a Help Center provider has one source of truth.
  return (
    <MessengerDockProvider>
      <HelpCenterBridge canAccess={canAccess} accessLoading={effectiveLoading}>
        {children}
      </HelpCenterBridge>
    </MessengerDockProvider>
  );
}

export function useHelpCenter() {
  const ctx = useContext(HelpCenterContext);
  if (!ctx) throw new Error("useHelpCenter must be used within HelpCenterProvider");
  return ctx;
}
