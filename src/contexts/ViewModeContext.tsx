import React, { createContext, useContext, useState, ReactNode } from "react";

interface ViewModeContextType {
  isViewingAsClient: boolean;
  setViewingAsClient: (value: boolean) => void;
  toggleViewAsClient: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [isViewingAsClient, setIsViewingAsClient] = useState(false);

  const setViewingAsClient = (value: boolean) => {
    setIsViewingAsClient(value);
  };

  const toggleViewAsClient = () => {
    setIsViewingAsClient((prev) => !prev);
  };

  return (
    <ViewModeContext.Provider value={{ isViewingAsClient, setViewingAsClient, toggleViewAsClient }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error("useViewMode must be used within a ViewModeProvider");
  }
  return context;
}
