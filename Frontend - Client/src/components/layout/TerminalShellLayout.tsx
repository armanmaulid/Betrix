import { useState, type ReactNode } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { TerminalShell } from "./TerminalShell";

export interface ShellContextType {
  setRightPanel: (panel: ReactNode | null) => void;
  setOnSearch: (handler: (s: string) => void) => void;
}

export function TerminalShellLayout() {
  const [rightPanel, setRightPanel] = useState<ReactNode | null>(null);
  const [onSearch, setOnSearch] = useState<((s: string) => void)>(() => () => {});

  const context: ShellContextType = {
    setRightPanel,
    setOnSearch: (fn: (s: string) => void) => setOnSearch(() => fn)
  };

  return (
    <TerminalShell onSearchSymbol={onSearch} rightPanel={rightPanel}>
      <Outlet context={context} />
    </TerminalShell>
  );
}

export function useShellContext() {
  return useOutletContext<ShellContextType>();
}
