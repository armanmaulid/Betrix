'use client';

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "../../store/authStore";
import { useShellStore } from "../../store/shellStore";
import { TerminalShell } from "./TerminalShell";

export function TerminalShellLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, restoreSession } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  
  const rightPanel = useShellStore((state) => state.rightPanel);
  const onSearch = useShellStore((state) => state.onSearch);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?from=${encodeURIComponent(pathname || "")}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-[var(--bg)] font-mono text-[12px] text-[var(--text-muted)]">
        Memuat sesi...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="dark">
      <TerminalShell onSearchSymbol={onSearch} rightPanel={rightPanel}>
        {children}
      </TerminalShell>
    </div>
  );
}

