import { create } from "zustand";

interface AskVivAssistantWidgetState {
  isOpen: boolean;
  openWidget: () => void;
  closeWidget: () => void;
  toggleWidget: () => void;
}

/**
 * Shared open/closed state for the Ask Viv Assistant floating widget —
 * mirrors useAskViv.tsx's shape for the old panel, so any component (the
 * widget's own launcher button, the topbar Ask Viv button, etc.) can control
 * the same widget instance without prop-drilling.
 */
export const useAskVivAssistantWidget = create<AskVivAssistantWidgetState>((set) => ({
  isOpen: false,
  openWidget: () => set({ isOpen: true }),
  closeWidget: () => set({ isOpen: false }),
  toggleWidget: () => set((state) => ({ isOpen: !state.isOpen })),
}));
