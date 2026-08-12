'use client';

import type { ReactNode } from "react";
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {  useAuthStore  } from "../../store/authStore";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const pathname = usePathname();

  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login?from=" + encodeURIComponent(pathname || ""));
    }
  }, [isLoading, user, pathname, router]);

  if (isLoading || !user) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-[var(--bg)] font-mono text-[12px] text-[var(--text-muted)]">
        Memuat sesi...
      </div>
    );
  }

  return <>{children}</>;
}

