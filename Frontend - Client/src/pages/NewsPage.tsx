import { useState, useEffect, useRef, useMemo } from "react";
import { TerminalShellLayout, useShellContext } from "../components/layout/TerminalShellLayout";
import { getNews, type NewsItem } from "../api/newsClient";
import { RefreshCw, Loader2 } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

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

const SOURCE_LIST = [
  "FXStreet",
  "ActionForex",
  "Investing Eco",
  "Investing Comms",
  "ForexCrunch",
  "WSJ Markets",
  "FXStreet Crypto",
  "CoinTelegraph",
  "Decrypt",
  "DailyHodl",
  "Crypto Briefing",
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

export function NewsPage() {
  const { setRightPanel, setOnSearch } = useShellContext();
  const { user } = useAuth();
  
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
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const sseRef = useRef<EventSource | null>(null);

  const sessionToken = localStorage.getItem("eaconsole.sessionToken") || "";

  const fetchInitial = async (asset: string | null = null) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getNews(sessionToken, { limit: 30, asset: asset || undefined });
      setItems(data);
    } catch (err: any) {
      setError(err.message || "Gagal memuat berita");
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    if (isLoadingMore || items.length === 0) return;
    setIsLoadingMore(true);
    try {
      const data = await getNews(sessionToken, { limit: 30, offset: items.length, asset: activeAsset || undefined });
      if (data.length > 0) {
        setItems((prev) => [...prev, ...data]);
      }
    } catch (err: any) {
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
    if (!sessionToken) return;

    sseRef.current = new EventSource(`${BACKEND_URL}/api/news/stream?token=${sessionToken}`);

    sseRef.current.addEventListener("news", (e) => {
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
            return [...trulyNew, ...prev];
          });
        }
      } catch (err) {
        console.error("Gagal parse event news:", err);
      }
    });

    sseRef.current.onerror = () => {
      console.warn("SSE News terputus, mencoba reconnect otomatis...");
    };

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
      clearTimeout(highlightTimeoutRef.current);
    };
  }, [activeAsset, sessionToken]);

  const feedStats = useMemo(() => {
    const stats: Record<string, number> = {};
    SOURCE_LIST.forEach(source => {
      stats[source] = 0;
    });
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
      <div className="flex h-full flex-col bg-[#050505]">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between border-b border-[#222] px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="bg-[#ff6600] px-2 py-0.5 text-[11px] font-bold uppercase text-black">
              News
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#00ff00]">
              <div className="h-1.5 w-1.5 animate-pulse bg-[#00ff00]"></div>
              LIVE
            </span>
            <span className="font-mono text-[11px] text-[#888]">{items.length} stories</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.label}
                onClick={() => setActiveAsset(t.id)}
                className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${
                  activeAsset === t.id
                    ? "bg-[#ff6600] text-black"
                    : "text-[#888] hover:text-[#fff]"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => fetchInitial(activeAsset)}
              className="ml-2 flex items-center gap-1 border border-[#333] px-3 py-1 text-[10px] font-bold uppercase text-[#888] transition-colors hover:border-[#555] hover:text-[#fff]"
            >
              <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} /> REFRESH
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* MAIN FEED */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {isLoading && items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[#555]">
                <Loader2 size={24} className="animate-spin text-[#ff6600]" />
                <p className="text-[12px]">Aggregating live feeds...</p>
              </div>
            ) : error ? (
              <div className="m-4 border border-red-500/30 bg-red-500/10 p-4 text-[12px] text-red-500">
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-[#555]">
                <p className="text-[12px]">No intelligence gathered for this sector.</p>
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
                      className={`block border-b border-[#222] p-4 transition-colors hover:bg-[#111] ${
                        newIds.has(item.id) ? "news-highlight border-[#ff6600]/50" : ""
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider">
                          <span className="text-[#ff9900] uppercase">{categoryLabel}</span>
                          <span className="text-[#00ffff] uppercase">{item.source}</span>
                        </div>
                        <span className="font-mono text-[10px] text-[#666]">
                          {formatRelativeTime(item.publishedAt)}
                        </span>
                      </div>
                      <h2 className="mb-1.5 text-[14px] font-bold leading-snug text-[#f5f5f5]">
                        {item.title}
                      </h2>
                      {item.summary && (
                        <p className="line-clamp-2 text-[12px] leading-relaxed text-[#999] opacity-80">
                          {item.summary}
                        </p>
                      )}
                    </a>
                  );
                })}
                {items.length >= 30 && (
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="flex w-full items-center justify-center gap-2 border-b border-[#222] bg-[#0a0a0a] py-4 text-[11px] font-bold uppercase tracking-wider text-[#888] transition-colors hover:bg-[#111] hover:text-[#ff9900]"
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
          <div className="bx-right-sidebar bg-[#050505]">
            {/* FEED STATUS */}
            <div className="flex h-[280px] flex-col border-b border-[#222]">
              <div className="flex items-center justify-between border-b border-[#222] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#ff9900]">
                <span className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 bg-[#ff9900]"></div>
                  FEED STATUS
                </span>
                <span className="text-[#666]">{feedStats.sorted.length} SOURCES</span>
              </div>
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
                {feedStats.sorted.map(([source, count], idx) => (
                  <div key={source} className="flex items-center justify-between font-mono text-[10px]">
                    <span className="w-28 truncate text-[#ccc]" title={source}>
                      {source}
                    </span>
                    <div className="mx-3 h-[3px] flex-1 overflow-hidden bg-[#222]">
                      <div
                        className={`h-full ${idx < 3 ? "bg-[#ff6600]" : "bg-[#00ffff]"}`}
                        style={{ width: `${(count / feedStats.max) * 100}%` }}
                      ></div>
                    </div>
                    <span className="w-6 text-right text-[#888]">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* NEWSWIRE */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#222] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#00ff00]">
                <span className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 bg-[#00ff00]"></div>
                  NEWSWIRE
                </span>
                <span className="text-[#666]">{wireItems.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-[1px] overflow-y-auto p-1 bg-[#111]">
                {wireItems.map((item) => (
                  <a
                    key={item.id + "_wire"}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 bg-[#050505] px-2 py-2 transition-colors hover:bg-[#1a1a1a]"
                  >
                    <span className="w-8 pt-[2px] font-mono text-[9px] text-[#666]">
                      {formatTime(item.publishedAt)}
                    </span>
                    <div className="mt-[7px] h-1 w-1 flex-shrink-0 bg-[#00ff00]"></div>
                    <span className="line-clamp-2 flex-1 text-[11px] leading-snug text-[#ccc] hover:text-white">
                      {item.title}
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
