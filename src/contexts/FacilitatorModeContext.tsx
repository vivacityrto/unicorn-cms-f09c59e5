import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

interface FacilitatorModeContextType {
  /** Whether facilitator mode is currently active */
  isFacilitatorMode: boolean;
  /** Toggle facilitator mode on/off */
  toggleFacilitatorMode: () => void;
  /** Enable facilitator mode */
  enableFacilitatorMode: () => void;
  /** Disable facilitator mode */
  disableFacilitatorMode: () => void;
  /** Whether the current user is eligible for facilitator mode */
  isEligible: boolean;
}

const FacilitatorModeContext = createContext<FacilitatorModeContextType | undefined>(undefined);

const STORAGE_KEY = 'unicorn_facilitator_mode';

/**
 * FacilitatorModeProvider manages the facilitator mode state.
 * 
 * Eligibility:
 * - Super Admin: Yes
 * - Team Leader: Yes
 * - Team Member: No
 * - Client users (Admin, User): No
 * 
 * Facilitator Mode changes how EOS is presented, not what data exists.
 * No new permissions, no hidden data, no special bypass.
 */
export function FacilitatorModeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [isFacilitatorMode, setIsFacilitatorMode] = useState(false);

  // Check eligibility - only Super Admin and Team Leader can use facilitator mode
  // Team Members are Vivacity staff but cannot facilitate
  const userRole = profile?.unicorn_role || '';
  const isEligible = userRole === 'Super Admin' || userRole === 'Team Leader';

  // Load initial state from session storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored === 'true' && isEligible) {
        setIsFacilitatorMode(true);
      }
    }
  }, [isEligible]);

  // Persist state to session storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, isFacilitatorMode.toString());
    }
  }, [isFacilitatorMode]);

  // Disable facilitator mode if user becomes ineligible
  useEffect(() => {
    if (!isEligible && isFacilitatorMode) {
      setIsFacilitatorMode(false);
    }
  }, [isEligible, isFacilitatorMode]);

  const toggleFacilitatorMode = () => {
    if (isEligible) {
      setIsFacilitatorMode((prev) => !prev);
    }
  };

  const enableFacilitatorMode = () => {
    if (isEligible) {
      setIsFacilitatorMode(true);
    }
  };

  const disableFacilitatorMode = () => {
    setIsFacilitatorMode(false);
  };

  return (
    <FacilitatorModeContext.Provider
      value={{
        isFacilitatorMode,
        toggleFacilitatorMode,
        enableFacilitatorMode,
        disableFacilitatorMode,
        isEligible,
      }}
    >
      {children}
    </FacilitatorModeContext.Provider>
  );
}

export function useFacilitatorMode() {
  const context = useContext(FacilitatorModeContext);
  if (context === undefined) {
    throw new Error("useFacilitatorMode must be used within a FacilitatorModeProvider");
  }
  return context;
}
