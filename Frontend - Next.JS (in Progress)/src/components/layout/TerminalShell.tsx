"use client";

import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { SideNavRail } from "./SideNavRail";
import { StatusBar } from "./StatusBar";
import { TickerStrip } from "../../features/market/components/TickerStrip";

interface TerminalShellProps {
  onSearchSymbol: (symbol: string) => void;
  rightPanel?: ReactNode;
  children: ReactNode;
}

// Shell terminal bersama dipakai DashboardPage & AnalyzePage — top bar,
// ticker marquee, rail kiri, dan status bar bawah semuanya identik di kedua
// halaman; yang beda cuma isi kolom tengah (children) dan kolom kanan
// (rightPanel, opsional — AnalyzePage tidak pakai kolom kanan).
export function TerminalShell({ onSearchSymbol, rightPanel, children }: TerminalShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] font-mono text-[13px] text-[var(--text-primary)]">
      <TopBar onSearchSymbol={onSearchSymbol} />
      <div className="bx-accent-line" />
      <TickerStrip />

      <div className="flex flex-1 overflow-hidden">
        <SideNavRail />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto page-container">{children}</div>

          {rightPanel && (
            <div className="bx-right-sidebar overflow-y-auto">
              {rightPanel}
            </div>
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  );
}

