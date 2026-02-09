import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type HelpCenterTab = "chatbot" | "csc" | "support";

interface HelpCenterContextType {
  isOpen: boolean;
  activeTab: HelpCenterTab;
  openHelpCenter: (tab?: HelpCenterTab) => void;
  closeHelpCenter: () => void;
  setActiveTab: (tab: HelpCenterTab) => void;
}

const HelpCenterContext = createContext<HelpCenterContextType | null>(null);

export function HelpCenterProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HelpCenterTab>("chatbot");

  const openHelpCenter = useCallback((tab: HelpCenterTab = "chatbot") => {
    setActiveTab(tab);
    setIsOpen(true);
  }, []);

  const closeHelpCenter = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <HelpCenterContext.Provider value={{ isOpen, activeTab, openHelpCenter, closeHelpCenter, setActiveTab }}>
      {children}
    </HelpCenterContext.Provider>
  );
}

export function useHelpCenter() {
  const ctx = useContext(HelpCenterContext);
  if (!ctx) throw new Error("useHelpCenter must be used within HelpCenterProvider");
  return ctx;
}
