import { useState, useMemo, Suspense, type ReactNode } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { TerminalShell } from "./TerminalShell";

export interface ShellContextType {
  setRightPanel: (panel: ReactNode | null) => void;
  setOnSearch: (handler: (s: string) => void) => void;
}

export function TerminalShellLayout() {
  const [rightPanel, setRightPanel] = useState<ReactNode | null>(null);
  const [onSearch, setOnSearch] = useState<((s: string) => void)>(() => () => {});

  const context = useMemo<ShellContextType>(() => ({
    setRightPanel,
    setOnSearch: (fn: (s: string) => void) => setOnSearch(() => fn)
  }), []);

  return (
    <TerminalShell onSearchSymbol={onSearch} rightPanel={rightPanel}>
      <Suspense fallback={
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase tracking-widest text-[#666]">
          Loading...
        </div>
      }>
        <Outlet context={context} />
      </Suspense>
    </TerminalShell>
  );
}

export function useShellContext() {
  return useOutletContext<ShellContextType>();
}
