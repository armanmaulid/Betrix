import React, { useEffect, useState, useRef } from "react";
import { Newspaper, RefreshCw } from "lucide-react";
import { getNews, type NewsItem } from "../api/newsClient";
import { acquireSharedEventSource, releaseSharedEventSource } from "../../market/hooks/useTickerPrices";

// types imported from newsClient

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
  usd: "bg-[var(--info-soft)] text-[var(--info)]",
  metal: "bg-[var(--caution-soft)] text-[var(--caution)]",
  oil: "bg-[var(--accent-soft)] text-[var(--accent)]",
  btc: "bg-[var(--info-soft)] text-[var(--info)]",
  crypto: "bg-[var(--info-soft)] text-[var(--info)]",
  eco: "bg-[var(--success-soft)] text-[var(--success)]",
  global: "bg-[var(--surface-alt)] text-[var(--text-muted)]",
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

function stripHtml(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

// Data dari backend /api/news via Vite proxy (localhost:3000).
// Mengambil data awal sekali saat komponen dimount, selanjutnya menerima update realtime via EventSource (SSE).
export const NewsFeed = React.memo(function NewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // null on the very first load — that's how we avoid flashing every item
  // the first time the feed renders (only items that show up on later
  // polls count as "new").
  const prevIdsRef = useRef<Set<string> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function load() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setError(null);
    try {
      const token = localStorage.getItem("eaconsole.sessionToken");
      if (!token) throw new Error("No session token");
      
      const fetched = await getNews(token, { limit: 20, signal: controller.signal });

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
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Gagal memuat berita");
    } finally {
      setIsLoading(false);
    }
  }

  // Load once on mount
  useEffect(() => {
    load();
  }, []);

  // Listen for realtime SSE news updates
  useEffect(() => {
    const es = acquireSharedEventSource();
    if (!es) return;

    const onNewsUpdate = (e: MessageEvent) => {
      try {
        const newArticles: NewsItem[] = JSON.parse(e.data);
        if (!newArticles || newArticles.length === 0) return;

        setItems((prev) => {
          // Prepend new articles and deduplicate by ID, keep max 50 items
          const combined = [...newArticles, ...prev];
          const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
          return unique.slice(0, 50);
        });

        const freshIds = new Set(newArticles.map(it => it.id));
        setNewIds(freshIds);
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => setNewIds(new Set()), 2500);

      } catch (err) {
        console.error("Failed to parse SSE news_update", err);
      }
    };

    es.addEventListener("news_update", onNewsUpdate);
    return () => {
      es.removeEventListener("news_update", onNewsUpdate);
      releaseSharedEventSource();
    };
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
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
                <span className="bg-[var(--surface-alt)] text-[var(--text-muted)] px-1 py-0.5 text-[9px] font-bold uppercase">
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
              <p className="text-[11.5px] leading-snug text-[var(--text-primary)]" title={stripHtml(item.title)}>{stripHtml(item.title)}</p>
              {item.summary && (
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-[var(--text-muted)]" title={stripHtml(item.summary)}>
                  {stripHtml(item.summary)}
                </p>
              )}
            </a>
          ))
        )}
      </div>


    </div>
  );
});

