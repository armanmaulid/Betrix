import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../features/auth/context/AuthContext";
import { Activity, Server, Clock, Database, User } from "lucide-react";
import { useVisibilityPoll } from "../../hooks/useVisibilityPoll";

const POLL_MS = 10_000; // Tiap 10 detik hitung ping (skip saat tab background)

export const StatusBar = React.memo(function StatusBar() {
  const { user, isConnected } = useAuth();
  const [ping, setPing] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useVisibilityPoll(async () => {
    const token = localStorage.getItem("eaconsole.sessionToken");
    if (!token) return;

    const start = performance.now();
    try {
      const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      await fetch(`${BACKEND_URL}/health`);
      const end = performance.now();
      if (!cancelledRef.current) setPing(Math.round(end - start));
    } catch (err) {
      if (!cancelledRef.current) setPing(null);
    }
  }, POLL_MS);

  const pingColor = 
    ping === null ? "text-[var(--text-muted)]" :
    ping < 100 ? "text-[var(--success)]" :
    ping < 300 ? "text-yellow-500" : "text-[var(--danger)]";

  return (
    <div className="flex flex-shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--surface-alt)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#b5a679]">
      <div className="flex items-center">
        {/* EXECUTION ENGINE */}
        <div className="flex items-center gap-1.5 border-r border-[var(--border)] pr-3">
          <Server size={10} className={isConnected ? "text-[var(--success)]" : "text-yellow-500"} />
          <span>ENGINE:</span>
          <span className={isConnected ? "text-[var(--success)]" : "text-yellow-500"}>
            {isConnected ? "CONNECTED" : "RECONNECTING"}
          </span>
        </div>

        {/* LATENCY */}
        <div className="flex items-center gap-1.5 border-r border-[var(--border)] px-3">
          <Activity size={10} className={pingColor} />
          <span>PING:</span>
          <span className={pingColor}>
            {ping !== null ? `${ping}ms` : "--"}
          </span>
        </div>

        {/* DATA TRAFFIC (DUMMY) */}
        <div className="flex items-center gap-1.5 border-r border-[var(--border)] px-3">
          <Database size={10} className="text-[#b5a679]" />
          <span>DATA:</span>
          <span className="text-[var(--text-primary)]">142 KB / 12 KB</span>
        </div>

        {/* MARKET STATUS (DUMMY) */}
        <div className="flex items-center gap-1.5 border-r border-[var(--border)] px-3">
          <Clock size={10} className="text-yellow-500" />
          <span>MARKET:</span>
          <span className="text-yellow-500">OPEN (NY)</span>
        </div>
      </div>

      <div className="flex items-center">
        {/* BUILD INFO */}
        <div className="flex items-center border-l border-[var(--border)] px-3 text-[var(--text-muted)]">
          BUILD: V1.0.0-BETA
        </div>

        {/* ACCOUNT INFO */}
        <div className="flex items-center gap-1.5 border-l border-[var(--border)] px-3 text-[var(--text-primary)]">
          <User size={10} className="text-[#b5a679]" />
          {user?.email || "NOT LOGGED IN"}
        </div>
      </div>
    </div>
  );
});

