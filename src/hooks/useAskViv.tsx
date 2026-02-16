import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AskVivMode = 'knowledge' | 'compliance' | 'web';

interface AskVivState {
  isOpen: boolean;
  selectedMode: AskVivMode;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setMode: (mode: AskVivMode) => void;
}

/**
 * Global state store for Ask Viv panel
 * Persists selected mode in localStorage
 */
export const useAskViv = create<AskVivState>()(
  persist(
    (set) => ({
      isOpen: false,
      selectedMode: 'knowledge',
      openPanel: () => set({ isOpen: true }),
      closePanel: () => set({ isOpen: false }),
      togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
      setMode: (mode) => set({ selectedMode: mode }),
    }),
    {
      name: 'ask-viv-state',
      partialize: (state) => ({ selectedMode: state.selectedMode }),
    }
  )
);
