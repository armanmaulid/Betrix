"use client";

import { useState, useMemo, createContext, useContext, type ReactNode } from "react";
import { TerminalShell } from "./TerminalShell";

export interface ShellContextType {
  setRightPanel: (panel: ReactNode | null) => void;
  setOnSearch: (handler: (s: string) => void) => void;
}

const ShellContext = createContext<ShellContextType>({
  setRightPanel: () => {},
  setOnSearch: () => {},
});

export function TerminalShellLayout({ children }: { children?: ReactNode }) {
  const [rightPanel, setRightPanel] = useState<ReactNode | null>(null);
  const [onSearch, setOnSearch] = useState<((s: string) => void)>(() => () => {});

  const context = useMemo<ShellContextType>(() => ({
    setRightPanel,
    setOnSearch: (fn: (s: string) => void) => setOnSearch(() => fn)
  }), []);

  return (
    <ShellContext.Provider value={context}>
      <TerminalShell onSearchSymbol={onSearch} rightPanel={rightPanel}>
        {children}
      </TerminalShell>
    </ShellContext.Provider>
  );
}

export function useShellContext() {
  return useContext(ShellContext);
}
