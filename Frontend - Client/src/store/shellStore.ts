import { create } from 'zustand';
import type { ReactNode } from 'react';

interface ShellState {
  rightPanel: ReactNode | null;
  onSearch: (s: string) => void;
  
  setRightPanel: (panel: ReactNode | null) => void;
  setOnSearch: (handler: (s: string) => void) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  rightPanel: null,
  onSearch: () => {},
  
  setRightPanel: (panel) => set({ rightPanel: panel }),
  setOnSearch: (handler) => set({ onSearch: handler }),
}));
