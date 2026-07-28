import { useEffect, useState, useRef } from "react";
import { Newspaper, RefreshCw } from "lucide-react";

interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string;
  summary: string | null;
  assetTags: string[];
  publishedAt: string;
}

const ASSET_LABEL: Record<string, string> = {
  usd: "USD",
  metal: "GOLD",
  oil: "OIL",
  btc: "BTC",
  crypto: "CRYPTO",
  eco: "MACRO",
  global: "GLOBAL",
};

const ASSET_COLOR: Record<string, string> = {
  usd: "bg-blue-500/20 text-blue-400",
  metal: "bg-yellow-500/20 text-yellow-400",
  oil: "bg-orange-500/20 text-orange-400",
  btc: "bg-purple-500/20 text-purple-400",
  crypto: "bg-purple-500/20 text-purple-400",
  eco: "bg-teal-500/20 text-teal-400",
  global: "bg-slate-500/20 text-slate-400",
};

const SOURCE_COLOR: Record<string, string> = {
  "FXStreet": "bg-indigo-500/20 text-indigo-300",
  "FXStreet Crypto": "bg-indigo-500/20 text-indigo-300",
  "ForexLive": "bg-emerald-500/20 text-emerald-300",
  "Investing Eco": "bg-amber-500/20 text-amber-300",
  "Investing Comms": "bg-amber-500/20 text-amber-300",
  "CNBC Finance": "bg-cyan-500/20 text-cyan-300",
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "baru saja";
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}

// Data dari backend /api/news via Vite proxy (localhost:3000).
// Auto-polling tiap 30 detik untuk update realtime.
// Nanti bisa diganti pakai EventSource(/api/news/stream) setelah ada login.
export function NewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  // null on the very first load — that's how we avoid flashing every item
  // the first time the feed renders (only items that show up on later
  // polls count as "new").
  const prevIdsRef = useRef<Set<string> | null>(null);

  async function load() {
    setError(null);
    try {
      const token = localStorage.getItem("eaconsole.sessionToken");
      if (!token) throw new Error("No session token");
      
      const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const res = await fetch(`${BACKEND_URL}/api/news?limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        localStorage.removeItem("eaconsole.sessionToken");
        window.location.href = "/login";
        throw new Error("Sesi kadaluarsa, silakan login kembali.");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const fetched: NewsItem[] = data.news;

      if (prevIdsRef.current) {
        const freshIds = new Set(fetched.filter((it) => !prevIdsRef.current!.has(it.id)).map((it) => it.id));
        if (freshIds.size > 0) {
          setNewIds(freshIds);
          clearTimeout(highlightTimeoutRef.current);
          // Matches the news-tint animation duration in index.css — clears
          // the class afterward so it can re-trigger on the next new item.
          highlightTimeoutRef.current = setTimeout(() => setNewIds(new Set()), 2500);
        }
      }
      prevIdsRef.current = new Set(fetched.map((it) => it.id));
      setItems(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat berita");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Polling tiap 30 detik — interval bersih otomatis pas unmount
    intervalRef.current = setInterval(load, 30_000);
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  return (
    <div className="flex h-[320px] flex-col border-b border-[var(--border)] bg-[var(--surface)] last:border-b-0">
      <div className="flex items-center justify-between border-b border-l-2 border-b-[var(--border)] border-l-[var(--danger)] bg-[var(--surface)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-400">
          <Newspaper size={12} className="text-[var(--danger)]" />
          Latest News
        </span>
        <button
          onClick={load}
          disabled={isLoading}
          aria-label="Muat ulang berita"
          className="btn-sweep text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Memuat...</p>
        ) : error ? (
          <p className="text-xs text-[var(--danger)]">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Tidak ada berita</p>
        ) : (
          items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={
                "block border-b border-[var(--border)] px-1.5 pb-2.5 last:border-b-0 last:pb-0 hover:opacity-80 " +
                (newIds.has(item.id) ? "news-highlight" : "")
              }
            >
              <div className="mb-1 flex items-center gap-1.5">
                {newIds.has(item.id) && (
                  <span className="bg-[var(--info)] px-1 py-0.5 text-[9px] font-bold uppercase text-[var(--bg)]">
                    Baru
                  </span>
                )}
                <span
                  className={
                    "rounded px-1 py-0.5 text-[9px] font-bold uppercase " +
                    (SOURCE_COLOR[item.source] || "bg-[var(--surface-alt)] text-[var(--text-muted)]")
                  }
                >
                  {item.source}
                </span>
                {item.assetTags.map((tag) => (
                  <span
                    key={tag}
                    className={
                      "rounded px-1 py-0.5 text-[9px] font-bold uppercase " +
                      (ASSET_COLOR[tag] || "bg-[var(--surface-alt)] text-[var(--text-muted)]")
                    }
                  >
                    {ASSET_LABEL[tag] || tag}
                  </span>
                ))}
                <span className="text-[10px] text-[var(--text-muted)]">
                  · {formatRelativeTime(item.publishedAt)}
                </span>
              </div>
              <p className="text-[11.5px] leading-snug text-[var(--text-primary)]">{item.title}</p>
              {item.summary && (
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-[var(--text-muted)]">
                  {item.summary}
                </p>
              )}
            </a>
          ))
        )}
      </div>
    </div>
  );
}
