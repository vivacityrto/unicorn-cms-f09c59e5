import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type HelpCenterTab = "chatbot" | "csc" | "support";

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

export function HelpCenterProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HelpCenterTab>("chatbot");
  const { profile } = useAuth();

  const userId = profile?.user_uuid ?? null;
  const tenantId = profile?.tenant_id ?? null;

  const { data: relationshipRole, isLoading: accessLoading } = useQuery({
    queryKey: ["help_center_access", userId, tenantId],
    enabled: !!userId && !!tenantId,
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

  const canAccess =
    relationshipRole === "primary_contact" || relationshipRole === "secondary_contact";

  const openHelpCenter = useCallback(
    (tab: HelpCenterTab = "chatbot") => {
      if (!canAccess) return;
      setActiveTab(tab);
      setIsOpen(true);
    },
    [canAccess]
  );

  const closeHelpCenter = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <HelpCenterContext.Provider
      value={{
        isOpen,
        activeTab,
        openHelpCenter,
        closeHelpCenter,
        setActiveTab,
        canAccess,
        accessLoading,
      }}
    >
      {children}
    </HelpCenterContext.Provider>
  );
}

export function useHelpCenter() {
  const ctx = useContext(HelpCenterContext);
  if (!ctx) throw new Error("useHelpCenter must be used within HelpCenterProvider");
  return ctx;
}
