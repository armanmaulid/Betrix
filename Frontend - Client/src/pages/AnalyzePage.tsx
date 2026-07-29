import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { TerminalShell } from "../components/layout/TerminalShell";
import { useAuth } from "../context/AuthContext";
import { 
  Bot, 
  CircleUser, 
  Leaf, 
  Globe, 
  Sparkles, 
  Paperclip, 
  ArrowRight,
  ChevronDown,
  Lock,
  MessageSquare,
  Trash2,
  Star,
  ArrowLeft,
  Download,
  Plus,
  Copy,
  FileText,
  ChevronRight
} from "lucide-react";
import { NewsFeed } from "../components/analysis/NewsFeed";
import { EconomicCalendar } from "../components/analysis/EconomicCalendar";
import { streamChat, getChatHistory, deleteChatSession } from "../api/chatClient";
import { fetchCandles, type Candle, fetchBrokerSymbols, type BrokerSymbol } from "../api/marketClient";
import { getNews, type NewsItem } from "../api/newsClient";
import ReactMarkdown from "react-markdown";

// Styling elemen Markdown supaya senada dengan tema terminal gelap Betrix
// (aksen orange #ff9900, border #222/#333) alih-alih default browser polos.
const markdownComponents = {
  h1: (props: any) => <h3 className="text-[13px] font-bold text-[#ff9900] mt-3 mb-1.5 first:mt-0" {...props} />,
  h2: (props: any) => <h3 className="text-[13px] font-bold text-[#ff9900] mt-3 mb-1.5 first:mt-0" {...props} />,
  h3: (props: any) => <h4 className="text-[12px] font-bold text-[#ff9900] mt-2.5 mb-1 first:mt-0" {...props} />,
  p: (props: any) => <p className="text-[12px] leading-relaxed text-[#eee] mb-2 last:mb-0" {...props} />,
  strong: (props: any) => <strong className="font-bold text-white" {...props} />,
  em: (props: any) => <em className="italic text-[#ccc]" {...props} />,
  ul: (props: any) => <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-[#eee]" {...props} />,
  ol: (props: any) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-[#eee]" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  hr: () => <hr className="border-t border-[#333] my-3" />,
  code: (props: any) => <code className="bg-[#1a1a1a] border border-[#333] rounded-sm px-1 py-0.5 text-[11px] text-[#ff9900]" {...props} />,
  blockquote: (props: any) => <blockquote className="border-l-2 border-[#ff9900] pl-3 text-[#aaa] italic my-2" {...props} />,
};

// Command instrumen yang men-trigger fetch data realtime MT5 (lihat mt5Client.js
// dan GET /api/market/candles di backend). Simbol diambil dari kata setelah command,
// mis. "/forex xauusd analisa ..." -> symbol=XAUUSD.
const INSTRUMENT_COMMANDS = ["forex", "crypto", "stock", "etf", "bond", "index", "futures"];
const TIMEFRAME_PATTERN = /\b(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\b/i;

interface ParsedInstrumentCommand {
  symbol: string;
  timeframe: string;
}

function parseInstrumentCommand(text: string): ParsedInstrumentCommand | null {
  const match = text.trim().match(/^\/(\w+)\s+(\S+)/);
  if (!match) return null;
  const [, cmd, symbolRaw] = match;
  if (!INSTRUMENT_COMMANDS.includes(cmd.toLowerCase())) return null;
  const tfMatch = text.match(TIMEFRAME_PATTERN);
  return {
    symbol: symbolRaw.toUpperCase(),
    timeframe: tfMatch ? tfMatch[1].toUpperCase() : "M15", // default M15 kalau timeframe tidak disebut
  };
}

// Susun prompt berisi data candle asli dari MT5 + instruksi format jawaban (Entry/SL/TP1-3
// + alasan + alternate entry), supaya LLM menjawab berbasis data nyata, bukan mengarang harga.
function buildTradeAnalysisPrompt(instrument: ParsedInstrumentCommand, candles: Candle[], originalText: string): string {
  if (!candles || candles.length === 0) {
    return `[DATA PASAR TIDAK TERSEDIA]\nData candle ${instrument.symbol} (${instrument.timeframe}) kosong/gagal diambil dari MT5 bridge. Beritahu user datanya sedang tidak tersedia, JANGAN mengarang harga.\n\n[PERMINTAAN USER]\n${originalText}`;
  }

  const recent = candles.slice(-100);
  const detail = recent.slice(-20); // detail candle dibatasi supaya prompt tidak kepanjangan
  const currentPrice = recent[recent.length - 1].close;
  const rangeHigh = Math.max(...recent.map(c => c.high));
  const rangeLow = Math.min(...recent.map(c => c.low));

  const candleLines = detail.map(c => {
    const t = new Date(c.time * 1000).toISOString().slice(5, 16).replace("T", " ");
    return `${t} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`;
  }).join("\n");

  return [
    `[DATA PASAR REALTIME - MT5]`,
    `Symbol: ${instrument.symbol} | Timeframe: ${instrument.timeframe}`,
    `Harga terkini: ${currentPrice}`,
    `Range ${recent.length} candle terakhir: High ${rangeHigh} / Low ${rangeLow}`,
    `${detail.length} candle terbaru (waktu UTC, terlama -> terbaru):`,
    candleLines,
    ``,
    `[INSTRUKSI FORMAT JAWABAN]`,
    `Wajib sertakan: Entry, Stop Loss (SL), Take Profit 1/2/3 (TP1, TP2, TP3), alasan teknikal berbasis data di atas, dan alternate entry kalau entry utama gagal atau kena SL. Gunakan HANYA data di atas, jangan mengarang harga yang tidak ada di data.`,
    ``,
    `[PERMINTAAN USER]`,
    originalText,
  ].join("\n");
}

// Cermin dari TASK_TIER_MAP + TIER_CREDIT_COST di backend (config/models.js,
// routes/chat.js) -- cuma dipakai buat nampilin estimasi biaya kredit di UI,
// bukan sumber kebenaran (backend yang benar-benar motong kreditnya).
const FRONTEND_TASK_TIER_MAP: Record<string, "cheap" | "balanced" | "deep"> = {
  faq: "cheap",
  classify_signal: "cheap",
  quick_summary: "balanced",
  market_insight: "balanced",
  trade_reasoning: "deep",
  risk_narrative: "deep",
};
const TIER_CREDIT_COST: Record<string, number> = { cheap: 1, balanced: 3, deep: 5 };
const AGENT_TIER_LABEL: Record<"cheap" | "balanced" | "deep", string> = { cheap: "Lite", balanced: "Balanced", deep: "Deep" };
// EQUITY memakai "global" sebagai proxy terdekat karena backend belum punya tag khusus
// saham/equity. NEWS gabung usd+metal+oil sebagai proxy "USD, METAL, OIL, ENERGY" --
// backend belum punya tag "energy" terpisah (kategori yang ada cuma: usd, metal, oil,
// btc, eco, global, crypto -- lihat VALID_ASSETS di routes/news.js), jadi OIL dipakai
// rangkap sebagai proxy energy juga. AUTO sengaja tidak dipetakan = tidak ada injeksi berita.
const TAB_TO_NEWS_ASSETS: Record<string, string[] | undefined> = {
  EQUITY: ["global"],
  MACRO: ["eco"],
  NEWS: ["usd", "metal", "oil"],
};

function buildNewsContextPrefix(tab: string, items: NewsItem[]): string {
  if (items.length === 0) return "";
  const lines = items.slice(0, 5).map(n => `- [${n.source}] ${n.title}`).join("\n");
  return `[BERITA TERBARU - mode ${tab}]\n${lines}\n\n`;
}

export function AnalyzePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const symbol = searchParams.get('symbol');
  const [activeTab, setActiveTab] = useState("AUTO");
  const [inputText, setInputText] = useState("");
  const [view, setView] = useState<'landing' | 'chat'>('landing');
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  // Agent tier (Lite=cheap/Balanced/Deep) dipakai sebagai override manual kalau
  // Optimize dimatikan. Default "cheap" match label "Lite" yang sebelumnya hardcoded di UI.
  const [agentTier, setAgentTier] = useState<"cheap" | "balanced" | "deep">("cheap");
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  // ON (default) = tier dipilih otomatis dari taskType (perilaku lama, non-breaking).
  // OFF = paksa pakai agentTier yang dipilih manual di dropdown, apa pun taskType-nya.
  const [optimizeEnabled, setOptimizeEnabled] = useState(true);
  // Belum ada integrasi search provider di backend -- toggle ini disimpan
  // tapi sengaja BELUM dikirim ke backend sampai provider-nya diputuskan.
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [allBrokerSymbols, setAllBrokerSymbols] = useState<BrokerSymbol[]>([]);

  const shortcuts = [
    { cmd: "/stock", desc: "stocks" },
    { cmd: "/etf", desc: "ETFs & funds" },
    { cmd: "/bond", desc: "bonds" },
    { cmd: "/crypto", desc: "crypto" },
    { cmd: "/index", desc: "indices" },
    { cmd: "/portfolio", desc: "portfolio" },
    { cmd: "/forex", desc: "forex pairs" },
    { cmd: "/futures", desc: "futures" },
    { cmd: "/watchlist", desc: "watchlist" },
  ];

  const templates = [
    {
      title: "Crypto & Digital Assets",
      desc: "Analyze Bitcoin post-halving cycle, ETF flows, and institutional adoption trends"
    },
    {
      title: "Dollar Decline & FX Strategy",
      desc: "Assess the weakening US dollar thesis and currency hedging opportunities"
    },
    {
      title: "S&P 500 Sector Rotation",
      desc: "Identify overweight and underweight sectors based on the macro cycle and earnings momentum"
    },
    {
      title: "Fed Rate Path & Fixed Income",
      desc: "Evaluate the Fed's rate cut trajectory, bond supply dynamics, and fixed income positioning"
    }
  ];

  const handleSubmit = async () => {
    if (!inputText.trim() || isStreaming) return;
    
    const text = inputText;
    setInputText("");
    setView('chat');
    setIsStreaming(true);

    // 1. Add user message (apa yang diketik user apa adanya) dan loading agent message
    setMessages(prev => [
      ...prev, 
      { role: 'user', content: text },
      { role: 'agent', content: "", isTyping: true } as any
    ]);

    // 2. Extract clean history to send to backend
    const chatHistory = messages.filter((m: any) => !m.isTyping).map((m: any) => ({
      role: m.role,
      content: m.content || ""
    }));

    // 3. Deteksi command instrumen (mis. "/forex xauusd analisa... M15") -> ambil data
    //    candle realtime dari MT5. Terpisah (tidak saling meniadakan): kalau tab
    //    EQUITY/MACRO/NEWS lagi aktif, konteks berita kategori itu JUGA disisipkan --
    //    jadi command instrumen + tab berita bisa jalan bareng buat analisa yang
    //    mempertimbangkan data teknikal MT5 sekaligus sentimen berita.
    //    Bubble chat tetap menampilkan `text` asli; yang dikirim ke backend (messageToSend)
    //    sudah diperkaya dengan data/berita supaya jawaban LLM berbasis data nyata.
    let taskType = symbol ? "market_insight" : "faq";
    let messageToSend = text;

    const instrument = parseInstrumentCommand(text);
    const tabAssets = TAB_TO_NEWS_ASSETS[activeTab];

    let newsPrefix = "";
    if (tabAssets) {
      try {
        const token = localStorage.getItem("eaconsole.sessionToken") || "";
        const newsLists = await Promise.all(
          tabAssets.map(asset => getNews(token, { asset, limit: 3 }).catch(() => [] as NewsItem[]))
        );
        const merged = newsLists.flat().sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
        newsPrefix = buildNewsContextPrefix(activeTab, merged);
      } catch (err) {
        // Gagal ambil berita bukan alasan buat nge-block chat -- lanjut tanpa konteks tambahan
        console.error("Failed to fetch news context:", err);
      }
    }

    if (instrument) {
      taskType = "trade_reasoning";
      let isInstrumentValid = true;
      let invalidReason = "";

      if (allBrokerSymbols.length > 0) {
        const cmdMatch = text.trim().match(/^\/(\w+)\s/);
        const cmd = cmdMatch ? cmdMatch[1].toLowerCase() : "";
        let expectedCategoryTokens: string[] = [];
        if (cmd === "forex") expectedCategoryTokens = ["forex"];
        else if (cmd === "crypto") expectedCategoryTokens = ["crypto"];
        else if (cmd === "stock") expectedCategoryTokens = ["stock", "equity"];
        else if (cmd === "etf") expectedCategoryTokens = ["etf", "fund"];
        else if (cmd === "bond") expectedCategoryTokens = ["bond"];
        else if (cmd === "index") expectedCategoryTokens = ["index", "indices"];
        else if (cmd === "futures") expectedCategoryTokens = ["commodity", "commodities", "futures", "energy", "metal"];

        const foundSymbol = allBrokerSymbols.find(s => s.symbol.toUpperCase() === instrument.symbol);
        
        if (!foundSymbol) {
          isInstrumentValid = false;
          invalidReason = `Simbol ${instrument.symbol} tidak ditemukan di platform broker saat ini. Minta user untuk mengetik '/${cmd} ' dan melihat popover suggestion untuk daftar simbol yang didukung broker.`;
        } else {
          const cat = (foundSymbol.category || "").toLowerCase();
          const path = (foundSymbol.path || "").toLowerCase();
          const isValidCategory = expectedCategoryTokens.length === 0 || expectedCategoryTokens.some(t => cat.includes(t) || path.includes(t));
          if (!isValidCategory) {
            isInstrumentValid = false;
            invalidReason = `Simbol ${instrument.symbol} memang ada di broker, tetapi itu BUKAN instrumen ${cmd} (kategori aslinya adalah '${foundSymbol.category || "Unknown"}'). Minta user untuk menggunakan command yang sesuai (misalnya /stock atau /crypto).`;
          }
        }
      }

      if (!isInstrumentValid) {
        messageToSend = `[KESALAHAN INPUT USER]\nUser mencoba menggunakan command instrumen namun simbolnya tidak valid. Beritahu user: ${invalidReason}\n\n[PERMINTAAN USER]\n${text}`;
      } else {
        try {
          const candles = await fetchCandles(instrument.symbol, instrument.timeframe, 100);
          messageToSend = newsPrefix + buildTradeAnalysisPrompt(instrument, candles, text);
        } catch (err: any) {
          messageToSend = newsPrefix + `[DATA PASAR TIDAK TERSEDIA: ${err?.message || "gagal mengambil data MT5"}]\n\nUser meminta analisa ${instrument.symbol} (${instrument.timeframe}) tapi data MT5 gagal diambil. Beritahu user datanya sedang tidak tersedia, JANGAN mengarang harga.\n\n[PERMINTAAN USER]\n${text}`;
        }
      }
    } else if (tabAssets) {
      taskType = "market_insight";
      messageToSend = newsPrefix + text;
    }

    // Tier override manual: cuma dikirim kalau Optimize dimatikan; kalau ON,
    // biarkan backend pilih tier otomatis dari taskType seperti biasa.
    const tierOverride = optimizeEnabled ? undefined : agentTier;

    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID();
      setCurrentSessionId(activeSessionId);
    }

    // 4. Optimistically update RECENT SESSIONS immediately
    setRecentSessions(prev => {
      if (prev.find(s => s.session_id === activeSessionId)) return prev;
      return [
        {
          session_id: activeSessionId,
          title: text,
          message: text,
          created_at: new Date().toISOString()
        },
        ...prev
      ].slice(0, 5);
    });

    // 5. Connect to backend stream
    streamChat(
      messageToSend, 
      text,
      chatHistory, 
      taskType,
      activeSessionId,
      tierOverride,
      (token) => {
        // Append token to the last message (must clone object for React to re-render)
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          const last = newMsgs[lastIndex];
          newMsgs[lastIndex] = {
            ...last,
            content: last.content + token,
            isTyping: false // Remove loading pulse once tokens arrive
          };
          return newMsgs;
        });
      },
      (result) => {
        // Add final metadata (latency, credits, etc)
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          const last = newMsgs[lastIndex];
          newMsgs[lastIndex] = {
            ...last,
            thinkingTime: `${(result.latencyMs / 1000).toFixed(1)}s`,
            tools: result.modelUsed,
            cost: `-${TIER_CREDIT_COST[tierOverride || FRONTEND_TASK_TIER_MAP[taskType] || "balanced"]}.0 CRD`
          };
          return newMsgs;
        });
        setIsStreaming(false);
      },
      (error) => {
        // Handle error state
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          const last = newMsgs[lastIndex];
          newMsgs[lastIndex] = {
            ...last,
            content: last.content ? last.content + `\n\n[Error: ${error}]` : `Error: ${error}`,
            isTyping: false
          };
          return newMsgs;
        });
        setIsStreaming(false);
      }
    );
  };

  useEffect(() => {
    if (view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, view]);

  useEffect(() => {
    if (!showAgentMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setShowAgentMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAgentMenu]);

  const fetchHistory = () => {
    getChatHistory(5).then(res => {
      if (res && res.data) {
        setRecentSessions(res.data);
      }
    }).catch(err => console.error("Failed to fetch chat history:", err));
  };

  useEffect(() => {
    if (view === 'landing') {
      fetchHistory();
    }
  }, [view]);

  useEffect(() => {
    fetchBrokerSymbols().then(setAllBrokerSymbols).catch(console.error);
  }, []);

  const loadSession = (session: any) => {
    setCurrentSessionId(session.session_id);
    if (session.turns && Array.isArray(session.turns)) {
      setMessages(
        session.turns.flatMap((turn: any) => [
          { role: 'user', content: turn.message },
          { 
            role: 'agent', 
            content: turn.reply || "...", 
            tools: turn.model_used,
            thinkingTime: turn.latency_ms ? `${(turn.latency_ms / 1000).toFixed(1)}s` : undefined,
            isTyping: false
          }
        ])
      );
    } else {
      setMessages([
        { role: 'user', content: session.title || session.message },
        { 
          role: 'agent', 
          content: session.reply || "...", 
          tools: session.model_used,
          thinkingTime: session.latency_ms ? `${(session.latency_ms / 1000).toFixed(1)}s` : undefined,
          isTyping: false
        }
      ]);
    }
    setView('chat');
  };

  const handleDeleteSession = (e: any, sessionId: string) => {
    e.stopPropagation();
    // Optimistic removal; kalau request gagal, kembalikan sesi ke daftar
    const prevSessions = recentSessions;
    setRecentSessions(prev => prev.filter(s => (s.session_id || s.id) !== sessionId));
    deleteChatSession(sessionId)
      .then(() => {
        // Re-sync dengan server (bukan cuma percaya state optimistic) supaya
        // kalau ternyata masih ada baris tersisa di server, langsung kelihatan
        // sekarang juga — bukan baru ketahuan setelah user refresh manual.
        fetchHistory();
      })
      .catch(err => {
        console.error("Failed to delete chat session:", err);
        setRecentSessions(prevSessions);
      });
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const showCommands = inputText.startsWith('/') && !inputText.includes(' ');
  const filteredShortcuts = inputText.length > 1 && showCommands
    ? shortcuts.filter(s => s.cmd.toLowerCase().includes(inputText.toLowerCase().trim()))
    : shortcuts;

  // Autocomplete simbol MT5
  let suggestedSymbols: BrokerSymbol[] = [];
  let symbolSearchPrefix = "";
  const symbolMatch = inputText.match(/^\/(\w+)\s+(\S*)$/);
  if (symbolMatch && INSTRUMENT_COMMANDS.includes(symbolMatch[1].toLowerCase())) {
    const cmd = symbolMatch[1].toLowerCase();
    const query = symbolMatch[2].toLowerCase();
    symbolSearchPrefix = `/${cmd} `;
    
    // Mapping command ke kategori/path MT5
    let expectedCategoryTokens: string[] = [];
    if (cmd === "forex") expectedCategoryTokens = ["forex"];
    else if (cmd === "crypto") expectedCategoryTokens = ["crypto"];
    else if (cmd === "stock") expectedCategoryTokens = ["stock", "equity"];
    else if (cmd === "etf") expectedCategoryTokens = ["etf", "fund"];
    else if (cmd === "bond") expectedCategoryTokens = ["bond"];
    else if (cmd === "index") expectedCategoryTokens = ["index", "indices"];
    else if (cmd === "futures") expectedCategoryTokens = ["commodity", "commodities", "futures", "energy", "metal"];

    const categoryFiltered = allBrokerSymbols.filter(s => {
      const cat = (s.category || "").toLowerCase();
      const path = (s.path || "").toLowerCase();
      return expectedCategoryTokens.length === 0 || expectedCategoryTokens.some(t => cat.includes(t) || path.includes(t));
    });

    if (query) {
      suggestedSymbols = categoryFiltered
        .filter(s => 
          s.symbol.toLowerCase().includes(query) || 
          (s.description && s.description.toLowerCase().includes(query))
        )
        .slice(0, 10);
    } else {
      suggestedSymbols = categoryFiltered.slice(0, 10);
    }
  }

  const renderCommandBox = (isChat = false) => (
    <div 
      className={`flex flex-col border-[#222] bg-[#0a0a0a] ${isChat ? 'border-t shrink-0' : 'border rounded-sm mt-1 shadow-[0_4px_24px_rgba(0,0,0,0.5)]'}`}
      onClick={() => inputRef.current?.focus()}
    >
      {/* TABS */}
      <div className={`flex items-center gap-4 ${isChat ? 'px-4 pt-3' : 'px-4 pt-2'}`}>
        <div className="flex border border-[#333] text-[9px] font-bold tracking-wider rounded-sm overflow-hidden bg-[#111]">
          {["AUTO", "EQUITY", "MACRO", "NEWS"].map(tab => (
            <button 
              key={tab}
              onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
              className={`px-3 py-0.5 transition-colors ${activeTab === tab ? "bg-[#ff9900] text-black" : "text-[#777] hover:text-[#ccc]"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* INPUT AREA */}
      <div className="flex items-center px-4 py-3 gap-3 group cursor-text relative">
        
        {/* SLASH COMMAND POPOVER */}
        {showCommands && filteredShortcuts.length > 0 && (
          <div className="absolute bottom-full left-10 mb-2 w-64 bg-[#0a0a0a] border border-[#333] shadow-2xl rounded-sm overflow-hidden z-50">
            <div className="px-3 py-1.5 bg-[#111] border-b border-[#222] text-[9px] font-bold text-[#777] uppercase tracking-wider">
              Suggested Commands
            </div>
            <div className="flex flex-col max-h-48 overflow-y-auto">
              {filteredShortcuts.map((s, i) => (
                <button 
                  key={s.cmd}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInputText(s.cmd + " ");
                    inputRef.current?.focus();
                  }}
                  className={`flex items-center justify-between px-3 py-2 text-left hover:bg-[#1a1a1a] transition-colors ${i !== filteredShortcuts.length - 1 ? 'border-b border-[#111]' : ''}`}
                >
                  <span className="text-[#ff9900] font-bold text-[11px]">{s.cmd}</span>
                  <span className="text-[#666] text-[10px]">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SYMBOL POPOVER */}
        {symbolSearchPrefix && suggestedSymbols.length > 0 && (
          <div className="absolute bottom-full left-10 mb-2 w-72 bg-[#0a0a0a] border border-[#333] shadow-2xl rounded-sm overflow-hidden z-50">
            <div className="px-3 py-1.5 bg-[#111] border-b border-[#222] text-[9px] font-bold text-[#777] uppercase tracking-wider">
              Suggested Symbols
            </div>
            <div className="flex flex-col max-h-48 overflow-y-auto">
              {suggestedSymbols.map((s, i) => (
                <button 
                  key={s.symbol}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInputText(symbolSearchPrefix + s.symbol + " ");
                    inputRef.current?.focus();
                  }}
                  className={`flex items-center justify-between px-3 py-2 text-left hover:bg-[#1a1a1a] transition-colors ${i !== suggestedSymbols.length - 1 ? 'border-b border-[#111]' : ''}`}
                >
                  <span className="text-[#00ffff] font-bold text-[11px]">{s.symbol}</span>
                  <span className="text-[#666] text-[10px] truncate max-w-[140px] text-right" title={s.description}>{s.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <span className="text-[#ff9900] font-bold text-lg leading-none mt-1">{'>'}</span>
        <textarea 
          ref={inputRef}
          rows={1}
          value={inputText}
          disabled={isStreaming}
          onChange={(e) => {
            setInputText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
              e.currentTarget.style.height = 'auto';
            }
          }}
          placeholder={isStreaming ? "Waiting for agent to reply..." : isChat ? "Follow up..." : "Ask your Agent to start your workflow"}
          className="flex-1 bg-transparent outline-none ring-0 border-none focus:outline-none focus:ring-0 focus:border-transparent text-[#eee] placeholder-[#555] text-[14px] resize-none overflow-y-auto min-h-[24px] max-h-[120px] leading-relaxed py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-1.5 self-end pb-1">
          <button
            onClick={() => { setAgentTier("cheap"); setOptimizeEnabled(false); }}
            title="Mode Lite (respons cepat, kredit paling murah)"
            className={`p-1 rounded-sm transition-opacity hover:opacity-80 ${!optimizeEnabled && agentTier === "cheap" ? "bg-[#00ff99] text-black" : "bg-[#00ff99]/30 text-[#00ff99]"}`}
          >
            <Leaf size={14} />
          </button>
          <button
            onClick={() => setWebSearchEnabled(v => !v)}
            title="Search Web (belum aktif di backend, lihat catatan tim)"
            className={`p-1 rounded-sm transition-opacity hover:opacity-80 ${webSearchEnabled ? "bg-[#00ffff] text-black" : "bg-[#00ffff]/30 text-[#00ffff]"}`}
          >
            <Globe size={14} />
          </button>
        </div>
      </div>

      {/* BOTTOM TOOLBAR */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[#222] bg-[#080808]">
        <span className="text-[10px] text-[#555]">Type <span className="text-[#888]">/</span> for commands</span>
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOptimizeEnabled(v => !v)}
            title={optimizeEnabled ? "Optimize aktif: tier model dipilih otomatis" : "Optimize mati: pakai tier manual dari dropdown Agent"}
            className={`flex items-center gap-1 border px-2 py-0.5 text-[10px] rounded-sm transition-colors ${optimizeEnabled ? "border-[#ff9900] text-[#ff9900]" : "border-[#333] text-[#888] hover:text-[#ccc] hover:border-[#555]"}`}
          >
            <Sparkles size={11} />
            Optimize
          </button>
          <div className="relative" ref={agentMenuRef}>
            <button
              onClick={() => setShowAgentMenu(v => !v)}
              title={optimizeEnabled ? "Optimize aktif -- matikan dulu untuk pakai tier manual ini" : "Pilih tier model manual"}
              className="flex items-center gap-1 border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-[#ccc] hover:border-[#555] rounded-sm transition-colors"
            >
              Agent : <span className={optimizeEnabled ? "text-[#666]" : "text-[#00ffff]"}>{AGENT_TIER_LABEL[agentTier]}</span>
              <ChevronDown size={10} className="ml-0.5" />
            </button>
            {showAgentMenu && (
              <div className="absolute bottom-full right-0 mb-1 w-36 bg-[#111] border border-[#333] rounded-sm shadow-lg z-10 overflow-hidden">
                {(["cheap", "balanced", "deep"] as const).map(tier => (
                  <button
                    key={tier}
                    onClick={() => { setAgentTier(tier); setOptimizeEnabled(false); setShowAgentMenu(false); }}
                    className={`flex w-full items-center justify-between px-2 py-1.5 text-[10px] hover:bg-[#1a1a1a] transition-colors ${agentTier === tier ? "text-[#00ffff]" : "text-[#888]"}`}
                  >
                    {AGENT_TIER_LABEL[tier]}
                    <span className="text-[#555]">{TIER_CREDIT_COST[tier]} CRD</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="p-1 text-[#666] hover:text-[#ccc] transition-colors ml-1">
            <Paperclip size={14} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleSubmit(); }} 
            disabled={isStreaming}
            className="p-1 bg-[#ff9900] text-black hover:opacity-80 rounded-sm transition-opacity ml-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <TerminalShell
      onSearchSymbol={() => {}}
      rightPanel={
        <>
          <div id="panel-news">
            <NewsFeed />
          </div>
          <div id="panel-calendar">
            <EconomicCalendar />
          </div>
        </>
      }
    >
      <div className="flex flex-col flex-1 bg-[#050505] overflow-hidden font-mono text-[13px] text-[#ccc]">
        
        {view === 'landing' ? (
          <div className="w-full px-8 py-4 flex flex-col gap-5 overflow-y-auto">
            {/* SHORTCUTS */}
            <div className="flex flex-col gap-2">
              <h2 className="text-[#00ffff] font-bold tracking-widest text-[11px]">SHORTCUTS {'>'}</h2>
              <div className="grid grid-cols-3 gap-y-1 gap-x-2">
                {shortcuts.map(s => (
                  <div key={s.cmd} className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-[#ff9900] font-bold">{s.cmd}</span>
                    <span className="text-[#777]">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* GREETING & COMMAND BOX */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bot className="text-[#eee]" size={28} />
                  <h1 className="text-lg text-[#eee] font-medium tracking-wide">
                    Hey {user?.name?.split(' ')[0] || "Ammarcyber"}, let's review today's moves{symbol ? ` for ${symbol}` : ''}.
                  </h1>
                </div>
                <button className="flex items-center gap-2 px-3 py-1 border border-[#333] rounded hover:border-[#ff9900] transition-colors">
                  <CircleUser size={14} className="text-[#ff9900]" />
                  <span className="text-[#ff9900] text-[10px] font-bold uppercase">{user?.name || "Manks"}</span>
                </button>
              </div>

              {renderCommandBox(false)}
            </div>

            {/* WORKFLOW */}
            <div className="flex flex-col gap-2 mt-1">
              <h2 className="text-[#00ffff] font-bold tracking-widest text-[11px]">WORKFLOW {'>'}</h2>
              <button className="flex items-center gap-1 text-[11px] font-bold text-[#eee] w-fit hover:text-white transition-colors">
                Suggested Templates <ChevronDown size={12} />
              </button>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {templates.map((t, idx) => (
                  <div key={idx} className="border border-[#222] bg-[#0a0a0a] p-3 flex flex-col gap-1.5 hover:border-[#444] transition-colors cursor-pointer shadow-sm">
                    <div className="flex items-start gap-1.5 text-[#ff9900] font-bold text-[11px]">
                      <Star size={12} className="mt-[1px] shrink-0 fill-[#ff9900]" />
                      <span className="leading-tight">{t.title}</span>
                    </div>
                    <p className="text-[10px] text-[#777] leading-snug">
                      {t.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* PRIVATE DATAROOM */}
            <div className="flex flex-col gap-2 mt-1">
              <h2 className="text-[#00ffff] font-bold tracking-widest text-[11px]">PRIVATE DATAROOM {'>'}</h2>
              <div className="flex items-center justify-between border border-[#222] bg-[#0a0a0a] px-4 py-3 cursor-pointer hover:border-[#444] transition-colors shadow-sm">
                <div className="flex items-center gap-2 text-[#555]">
                  <Lock size={14} className="text-[#ff9900]" />
                  <span className="text-[11px]">No documents uploaded. Click to open dataroom.</span>
                </div>
                <span className="text-[#ff9900] text-[10px] font-bold tracking-widest">OPEN {'>'}</span>
              </div>
            </div>

            {/* RECENT SESSIONS */}
            <div className="flex flex-col gap-2 mt-1 mb-6">
              <h2 className="text-[#00ffff] font-bold tracking-widest text-[11px]">RECENT SESSIONS {'>'}</h2>
              {recentSessions.length === 0 ? (
                <div className="text-[#555] text-[11px] italic px-4 py-2">No recent sessions found.</div>
              ) : (
                recentSessions.map((session: any) => (
                  <div key={session.session_id || session.id} className="flex items-center justify-between border border-[#222] bg-[#0a0a0a] px-4 py-2 group hover:border-[#444] transition-colors shadow-sm">
                    <div className="flex items-center gap-2 text-[#ccc] w-full max-w-[80%]">
                      <MessageSquare size={14} className="text-[#ff9900] shrink-0" />
                      <span onClick={() => loadSession(session)} className="text-[11px] truncate hover:text-white cursor-pointer transition-colors w-full">
                        {session.title || session.message}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[#555] text-[10px]">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[#ff9900] font-bold">Q</span>
                        <span>{timeAgo(session.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDeleteSession(e, session.session_id || session.id)}
                          className="hover:text-[#ff4444] transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* ACTIVE CHAT VIEW */
          <div className="flex flex-col flex-1 overflow-hidden relative animate-slide-up-fade">
            
            {/* TOP BAR */}
            <div className="flex items-center justify-between border-b border-[#222] bg-[#0a0a0a] px-8 py-2 shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={() => {setMessages([]); setView('landing'); setCurrentSessionId(null);}} className="flex items-center gap-1.5 text-[9px] font-bold text-[#888] hover:text-white transition-colors border border-[#333] px-2 py-1 rounded-sm">
                  <ArrowLeft size={10} /> BACK
                </button>
                <div className="flex items-center">
                  <span className="bg-[#ff9900] text-black text-[9px] font-bold px-2 py-1 rounded-sm">CHAT</span>
                  <span className="text-[#555] text-[10px] font-bold ml-3">{messages.length} msgs</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 text-[9px] font-bold text-[#888] hover:text-white transition-colors border border-[#333] px-2 py-1 rounded-sm">
                  <Download size={10} /> EXPORT
                </button>
                <button onClick={() => {setMessages([]); setView('landing'); setCurrentSessionId(null);}} className="flex items-center gap-1.5 text-[9px] font-bold text-black bg-[#ff9900] hover:opacity-80 transition-opacity px-2 py-1 rounded-sm">
                  <Plus size={10} /> NEW
                </button>
              </div>
            </div>

            {/* MESSAGES */}
            <div className="flex flex-col flex-1 overflow-y-auto px-8 py-6 gap-6">
              {messages.map((msg: any, idx) => (
                msg.role === 'user' ? (
                  <div key={idx} className="flex justify-end">
                    <div className="bg-[#ff9900] text-black font-bold px-4 py-2 rounded-sm max-w-[80%] text-[12px] whitespace-pre-wrap shadow-lg">
                      {msg.content}
                    </div>
                  </div>
                ) : msg.isTyping ? (
                  <div key={idx} className="flex flex-col w-full max-w-4xl gap-3">
                    <div className="flex flex-col border border-[#333] bg-[#0a0a0a] rounded-sm p-5 shadow-lg">
                      <div className="flex items-center gap-3 text-[#ff9900] font-bold text-[11px] animate-pulse">
                        <Globe size={14} className="animate-spin" /> 
                        <span>Agent is analyzing market data and executing tools...</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="flex flex-col w-full max-w-4xl gap-3">
                    <div className="flex flex-col border border-[#333] bg-[#0a0a0a] rounded-sm shadow-lg">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-[#222]">
                        <div className="flex items-center gap-2 text-[#eee] font-bold text-[11px]">
                          <ChevronRight size={12} className="text-[#ff9900]" /> Agent Thinking
                        </div>
                        <span className="text-[#555] text-[10px] font-bold">
                          {msg.thinkingTime} 
                          {msg.cost && <span className="ml-2 text-[#ff4444]">{msg.cost}</span>}
                        </span>
                      </div>
                      <div className="px-5 py-4 text-[#eee] leading-relaxed text-[12px]">
                        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                      </div>
                      <div className="flex justify-end gap-2 px-4 py-2 border-t border-[#111]">
                        <button className="flex items-center gap-1.5 border border-[#333] px-2 py-1 text-[9px] font-bold text-[#888] hover:text-white rounded-sm transition-colors">
                          <Copy size={10} /> COPY
                        </button>
                        <button className="flex items-center gap-1.5 border border-[#333] px-2 py-1 text-[9px] font-bold text-[#888] hover:text-white rounded-sm transition-colors">
                          <FileText size={10} />
                        </button>
                      </div>
                    </div>

                    {/* SUGGESTED FOLLOWUPS (only show after last message) */}
                    {idx === messages.length - 1 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <button className="border border-[#333] text-[#888] hover:text-[#ccc] hover:border-[#555] px-3 py-1.5 text-[10px] rounded-sm transition-colors bg-[#080808]">
                          What is the price target and valuation for AI?
                        </button>
                        <button className="border border-[#333] text-[#888] hover:text-[#ccc] hover:border-[#555] px-3 py-1.5 text-[10px] rounded-sm transition-colors bg-[#080808]">
                          What are the key risks facing AI?
                        </button>
                        <button className="border border-[#333] text-[#888] hover:text-[#ccc] hover:border-[#555] px-3 py-1.5 text-[10px] rounded-sm transition-colors bg-[#080808]">
                          What is the current macro environment impact on this sector?
                        </button>
                      </div>
                    )}
                  </div>
                )
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT BOX (PINNED TO BOTTOM) */}
            {renderCommandBox(true)}
            
          </div>
        )}
      </div>
    </TerminalShell>
  );
}
