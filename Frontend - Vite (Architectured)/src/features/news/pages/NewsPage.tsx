import { useState, useEffect, useRef, useMemo } from "react";
import { useShellContext } from "../../../app/layout/TerminalShellLayout";
import { getNews, type NewsItem } from "../api/newsClient";
import { acquireSharedEventSource, releaseSharedEventSource } from "../../market/hooks/useTickerPrices";
import { RefreshCw, Loader2 } from "lucide-react";

const ASSET_LABEL: Record<string, string> = {
  usd: "MARKETS",
  metal: "METALS",
  oil: "ENERGY",
  btc: "CRYPTO",
  crypto: "CRYPTO",
  eco: "ECONOMICS",
  global: "WORLD",
};

const TABS = [
  { id: null, label: "ALL" },
  { id: "usd", label: "MARKETS" },
  { id: "eco", label: "ECONOMICS" },
  { id: "metal", label: "METALS" },
  { id: "oil", label: "ENERGY" },
  { id: "btc", label: "CRYPTO" },
  { id: "global", label: "WORLD" },
];


function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function stripHtml(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

export function NewsPage() {
  const { setRightPanel, setOnSearch } = useShellContext();
  
  useEffect(() => {
    setOnSearch(() => {});
    setRightPanel(null);
  }, [setOnSearch, setRightPanel]);

  const [items, setItems] = useState<NewsItem[]>([]);
  const [wireItems, setWireItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<string | null>(null);

  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Pagination offset tracked separately from items.length — SSE prepends new
  // items into the same array, so using items.length as the offset drifts.
  const [archiveOffset, setArchiveOffset] = useState(0);

  const sessionToken = localStorage.getItem("eaconsole.sessionToken") || "";

  const fetchInitial = async (asset: string | null = null) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getNews(sessionToken, { limit: 30, asset: asset || undefined, signal: controller.signal });
      setItems(data);
      setArchiveOffset(data.length);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setError(err.message || "Gagal memuat berita");
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    if (isLoadingMore || archiveOffset === 0) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoadingMore(true);
    try {
      const data = await getNews(sessionToken, { limit: 30, offset: archiveOffset, asset: activeAsset || undefined, signal: controller.signal });
      if (data.length > 0) {
        setItems((prev) => [...prev, ...data]);
        setArchiveOffset((prev) => prev + data.length);
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setError(err.message || "Gagal memuat berita tambahan");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const fetchWire = async () => {
    try {
      const data = await getNews(sessionToken, { limit: 50, asset: "global" });
      setWireItems(data);
    } catch (err) {
      console.error("Gagal memuat kawat berita:", err);
    }
  };

  useEffect(() => {
    fetchInitial(activeAsset);
  }, [activeAsset]);

  useEffect(() => {
    if (sessionToken) {
      fetchWire();
    }
  }, [sessionToken]);

  useEffect(() => {
    const es = acquireSharedEventSource();
    if (!es) return;

    const onNewsUpdate = (e: MessageEvent) => {
      try {
        const newArticles: NewsItem[] = JSON.parse(e.data);

        const filteredNewArticles = activeAsset
          ? newArticles.filter((article) => article.assetTags.includes(activeAsset))
          : newArticles;

        if (filteredNewArticles.length > 0) {
          const freshIds = new Set(filteredNewArticles.map((a) => a.id));

          setItems((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const trulyNew = filteredNewArticles.filter((a) => !existingIds.has(a.id));
            return [...trulyNew, ...prev];
          });

          setNewIds(freshIds);
          clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = setTimeout(() => setNewIds(new Set()), 2500);
        }

        const globalArticles = newArticles.filter((article) => article.assetTags.includes("global"));
        if (globalArticles.length > 0) {
          setWireItems((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const trulyNew = globalArticles.filter((a) => !existingIds.has(a.id));
            // Cap like NewsFeed so a long session doesn't grow this forever.
            return [...trulyNew, ...prev].slice(0, 50);
          });
        }
      } catch (err) {
        console.error("Gagal parse SSE berita", err);
      }
    };

    es.addEventListener("news_update", onNewsUpdate);

    return () => {
      es.removeEventListener("news_update", onNewsUpdate);
      releaseSharedEventSource();
      clearTimeout(highlightTimeoutRef.current);
    };
  }, [activeAsset, sessionToken]);

  const feedStats = useMemo(() => {
    const stats: Record<string, number> = {};
    items.forEach((item) => {
      stats[item.source] = (stats[item.source] || 0) + 1;
    });
    const sorted = Object.entries(stats).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    const max = sorted.length > 0 && sorted[0][1] > 0 ? sorted[0][1] : 1;
    return { sorted, max };
  }, [items]);

  return (
    <>
      <div className="flex h-full flex-col bg-[var(--bg)]">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between border-b border-[var(--border)] py-2 page-container">
          <div className="flex items-center gap-3">
            <span className="bx-section-tag">
              News
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--success)]">
              <div className="h-1.5 w-1.5 animate-pulse bg-[var(--success)]"></div>
              LIVE
            </span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{items.length} stories</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.label}
                onClick={() => setActiveAsset(t.id)}
                className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${
                  activeAsset === t.id
                    ? "bg-[var(--accent)] text-black"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => fetchInitial(activeAsset)}
              className="ml-2 flex items-center gap-1 border border-[var(--border)] px-3 py-1 text-[10px] font-bold uppercase text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} /> REFRESH
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* MAIN FEED */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {isLoading && items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                <p className="text-[12px]">Mengagregasi feed langsung...</p>
              </div>
            ) : error ? (
              <div className="bx-alert bx-alert-error my-4 p-4">
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-[var(--text-muted)]">
                <p className="text-[12px]">Belum ada intelijen untuk sektor ini.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {items.map((item) => {
                  const primaryTag = item.assetTags[0];
                  const categoryLabel = ASSET_LABEL[primaryTag] || "NEWS";

                  return (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`block border-b border-[var(--border)] py-4 transition-colors hover:bg-[var(--surface-alt)] ${
                        newIds.has(item.id) ? "news-highlight border-[var(--accent)]/50" : ""
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider">
                          <span className="text-[var(--accent)] uppercase">{categoryLabel}</span>
                          <span className="text-[var(--info)] uppercase">{item.source}</span>
                        </div>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          {formatRelativeTime(item.publishedAt)}
                        </span>
                      </div>
                      <h2 className="mb-1.5 text-[14px] font-bold leading-snug text-[var(--text-primary)]" title={item.title}>
                        {stripHtml(item.title)}
                      </h2>
                      {item.summary && (
                        <p className="line-clamp-2 text-[12px] leading-relaxed text-[var(--text-muted)] opacity-80" title={stripHtml(item.summary)}>
                          {stripHtml(item.summary)}
                        </p>
                      )}
                    </a>
                  );
                })}
                {items.length >= 30 && (
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="flex w-full items-center justify-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] py-4 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-alt)] hover:text-[var(--accent)]"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> LOADING ARCHIVES...
                      </>
                    ) : (
                      "LOAD MORE INTELLIGENCE"
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="bx-right-sidebar bg-[var(--bg)]">
            {/* FEED STATUS */}
            <div className="flex max-h-[280px] shrink-0 flex-col border-b border-[var(--border)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] page-container py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
                <span className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 bg-[var(--accent)]"></div>
                  FEED STATUS
                </span>
                <span className="text-[var(--text-muted)]">{feedStats.sorted.length} SOURCES</span>
              </div>
              <div className="flex flex-col gap-2.5 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
                {feedStats.sorted.map(([source, count], idx) => (
                  <div key={source} className="flex items-center justify-between font-mono text-[10px]">
                    <span className="w-28 truncate text-[var(--text-primary)]" title={source}>
                      {source}
                    </span>
                    <div className="mx-3 h-[3px] flex-1 overflow-hidden bg-[var(--border)]">
                      <div
                        className={`h-full ${idx < 3 ? "bg-[var(--accent)]" : "bg-[var(--info)]"}`}
                        style={{ width: `${(count / feedStats.max) * 100}%` }}
                      ></div>
                    </div>
                    <span className="w-6 text-right text-[var(--text-muted)]">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* NEWSWIRE */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] page-container py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--success)]">
                <span className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 bg-[var(--success)]"></div>
                  NEWSWIRE
                </span>
                <span className="text-[var(--text-muted)]">{wireItems.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-[1px] overflow-y-auto p-1 bg-[var(--surface-alt)]">
                {wireItems.map((item) => (
                  <a
                    key={item.id + "_wire"}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 bg-[var(--bg)] px-2 py-2 transition-colors hover:bg-[var(--surface-alt)]"
                  >
                    <span className="w-8 pt-[2px] font-mono text-[9px] text-[var(--text-muted)]">
                      {formatTime(item.publishedAt)}
                    </span>
                    <div className="mt-[7px] h-1 w-1 flex-shrink-0 bg-[var(--success)]"></div>
                    <span className="line-clamp-2 flex-1 text-[11px] leading-snug text-[var(--text-primary)] hover:text-[var(--text-primary)]" title={stripHtml(item.title)}>
                      {stripHtml(item.title)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

