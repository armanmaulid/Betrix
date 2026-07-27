import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

// Colors pulled from the same charcoal-amber tokens used everywhere else
// (Badge, TickerStat, etc.) so a toast never looks like a bolted-on library.
const ACCENT_COLOR: Record<ToastType, string> = {
  success: "var(--success)",
  error: "var(--danger)",
  info: "var(--accent)",
};

const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          const color = ACCENT_COLOR[toast.type];
          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-xl"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <Icon size={18} style={{ color }} className="mt-0.5 flex-shrink-0" />
              <p className="flex-1 text-sm text-[var(--text-primary)]">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Tutup notifikasi"
                className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return ctx;
}
