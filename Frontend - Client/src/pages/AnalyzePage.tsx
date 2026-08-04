import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { TerminalShellLayout, useShellContext } from "../components/layout/TerminalShellLayout";
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
  X
} from "lucide-react";
import { NewsFeed } from "../components/analysis/NewsFeed";
import { EconomicCalendar } from "../components/analysis/EconomicCalendar";
import { ChatMessageItem } from "../components/analysis/ChatMessageItem";
import { streamChat, getChatHistory, deleteChatSession } from "../api/chatClient";
import { fetchCandles, type BrokerSymbol, fetchBrokerSymbols } from "../api/marketClient";
import { getNews, type NewsItem } from "../api/newsClient";
import {
  INSTRUMENT_COMMANDS,
  parseInstrumentCommand,
  buildTradeAnalysisPrompt,
  FRONTEND_TASK_TIER_MAP,
  TIER_CREDIT_COST,
  AGENT_TIER_LABEL,
  TAB_TO_NEWS_ASSETS,
  buildNewsContextPrefix,
  CHAT_SHORTCUTS,
  CHAT_TEMPLATES,
} from "../lib/analyzePageHelpers";

export function AnalyzePage() {
  const { setRightPanel, setOnSearch } = useShellContext();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // Harus sinkron dengan MAX_IMAGE_BYTES di Backend/src/routes/chat.js

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_IMAGE_BYTES) {
        alert(`Ukuran gambar terlalu besar! Maksimal ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`);
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!inputText.trim() || isStreaming) return;
    
    const text = inputText;
    setInputText("");
    setView('chat');
    setIsStreaming(true);

    // 1. Add user message (apa yang diketik user apa adanya) dan loading agent message
    setMessages(prev => [
      ...prev, 
      { role: 'user', content: text, image: attachedImage },
      { role: 'agent', content: "", isTyping: true } as any
    ]);
    
    const imageToSend = attachedImage;
    setAttachedImage(null);

    // 2. Extract clean history to send to backend
    const chatHistory = messages.filter((m: any) => !m.isTyping).map((m: any) => ({
      role: m.role,
      content: m.content || "",
      image: m.image
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

    // Penampung token (buffer) 40ms (sekitar 25 FPS).
    // Kenapa? Jika pesan AI menjadi SANGAT panjang, merender ulang teks utuh 
    // dengan ReactMarkdown 50x-100x per detik (kecepatan token masuk) 
    // akan membebani "Main Thread" browser dan membuat seluruh CSS animasi (seperti TickerStrip) tersendat.
    let pendingTokens = "";
    let lastRenderTime = Date.now();
    let flushTimeout: any = null;

    const flushTokens = () => {
      if (!pendingTokens) return;
      const toFlush = pendingTokens;
      pendingTokens = "";
      
      setMessages(prev => {
        const newMsgs = [...prev];
        const lastIndex = newMsgs.length - 1;
        const last = newMsgs[lastIndex];
        newMsgs[lastIndex] = {
          ...last,
          content: last.content + toFlush,
          isTyping: false
        };
        return newMsgs;
      });
      lastRenderTime = Date.now();
    };

    // 5. Connect to backend stream
    streamChat(
      messageToSend, 
      text,
      chatHistory, 
      taskType,
      activeSessionId,
      tierOverride,
      imageToSend,
      (token) => {
        pendingTokens += token;
        const now = Date.now();
        // Render tiap 40ms (25 FPS) — super mulus di mata, sangat ringan di CPU.
        if (now - lastRenderTime > 40) {
          if (flushTimeout) clearTimeout(flushTimeout);
          flushTokens();
        } else {
          if (flushTimeout) clearTimeout(flushTimeout);
          flushTimeout = setTimeout(flushTokens, 40);
        }
      },
      (result) => {
        if (flushTimeout) clearTimeout(flushTimeout);
        flushTokens();
        
        // Add final metadata (latency, credits, etc)
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          const last = newMsgs[lastIndex];
          newMsgs[lastIndex] = {
            ...last,
            thinkingTime: `${(result.latencyMs / 1000).toFixed(1)}s`,
            tools: result.modelUsed,
            cost: `-${TIER_CREDIT_COST[tierOverride || FRONTEND_TASK_TIER_MAP[taskType] || "balanced"]}.0 CRD`,
            isFinishedGlow: true
          };
          return newMsgs;
        });
        setIsStreaming(false);
      },
      (error) => {
        if (flushTimeout) clearTimeout(flushTimeout);
        flushTokens();
        
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
    // Autoscroll dimatikan sepenuhnya atas permintaan user untuk menghindari 
    // efek berkedut (jitter) saat teks AI di-render.
    /*
    if (view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth" });
    }
    */
  }, [view]);

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
    ? CHAT_SHORTCUTS.filter(s => s.cmd.toLowerCase().includes(inputText.toLowerCase().trim()))
    : CHAT_SHORTCUTS;

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

        {attachedImage && (
          <div className="relative p-1 bg-[#111] border border-[#333] rounded-sm group flex-shrink-0">
            <img src={attachedImage} alt="Attachment" className="h-12 w-12 object-cover rounded-sm" />
            <button 
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
            >
              <X size={10} />
            </button>
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
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-1 text-[#666] hover:text-[#ccc] transition-colors ml-1"
          >
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

  const handleExport = () => {
    if (messages.length === 0) return;
    
    let content = "# Betrix AI Agent - Analysis Session\n\n";
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Symbol Context: ${symbol || 'N/A'}\n\n---\n\n`;
    
    messages.forEach((msg) => {
      if (msg.role === 'user') {
        content += `### You:\n${msg.content}\n\n`;
      } else {
        content += `### Agent:\n${msg.content}\n\n`;
      }
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `betrix-session-export-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearchSymbol = useCallback((s: string) => {
    navigate(`/?symbol=${s.toUpperCase()}`);
  }, [navigate]);

  useEffect(() => {
    setOnSearch(handleSearchSymbol);
    setRightPanel(
      <>
        <div id="panel-news">
          <NewsFeed />
        </div>
        <div id="panel-calendar">
          <EconomicCalendar />
        </div>
      </>
    );
    return () => {
      setOnSearch(() => {});
      setRightPanel(null);
    };
  }, [setOnSearch, setRightPanel, handleSearchSymbol]);

  return (
    <>
      <div className="flex flex-col flex-1 bg-[#050505] overflow-hidden font-mono text-[13px] text-[#ccc]">
        
        {view === 'landing' ? (
          <div className="w-full px-8 py-4 flex flex-col gap-5 overflow-y-auto">
            {/* SHORTCUTS */}
            <div className="flex flex-col gap-2">
              <h2 className="text-[#00ffff] font-bold tracking-widest text-[11px]">SHORTCUTS {'>'}</h2>
              <div className="grid grid-cols-3 gap-y-1 gap-x-2">
                {CHAT_SHORTCUTS.map(s => (
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
                {CHAT_TEMPLATES.map((t, idx) => (
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
                <button onClick={handleExport} className="flex items-center gap-1.5 text-[9px] font-bold text-[#888] hover:text-white transition-colors border border-[#333] px-2 py-1 rounded-sm">
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
                <ChatMessageItem key={idx} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT BOX (PINNED TO BOTTOM) */}
            {renderCommandBox(true)}
            
          </div>
        )}
      </div>
    </>
  );
}
