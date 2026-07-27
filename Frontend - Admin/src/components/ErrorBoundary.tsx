import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Sits at the root, outside every context provider, so a crash inside any
// provider (Theme/Auth/Toast/QueryClient) is still caught instead of
// producing a blank white screen. The trade-off: an error anywhere resets
// the *whole* app to this screen rather than just the page that broke.
// Fine for a single-team admin console; revisit with per-route boundaries
// if that granularity becomes worth the extra complexity.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Swap for a real error-reporting call (Sentry, etc.) when one exists.
    console.error("Unhandled error caught by ErrorBoundary:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center text-[var(--text-primary)]">
          <div className="rounded-full bg-[var(--danger-soft)] p-4">
            <AlertTriangle size={32} className="text-[var(--danger)]" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold">Terjadi Kesalahan</h1>
            <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
              Ada yang salah saat menampilkan halaman ini. Coba muat ulang, atau kembali ke
              dashboard.
            </p>
          </div>

          {this.state.error && (
            <pre className="tabular max-w-lg overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-left text-xs text-[var(--text-muted)]">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex gap-2">
            <button
              onClick={this.handleReload}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
            >
              <RotateCw size={14} /> Muat Ulang
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Home size={14} /> Kembali ke Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
