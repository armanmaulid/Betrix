import { useChatStore } from "../store/useChatStore";
import { streamChat } from "../api/chatClient";
import { fetchOHLC } from "../../market/api/marketClient";
import { getNews, type NewsItem } from "../../news/api/newsClient";
import { useBrokerSymbols } from "../../market/api/queries";
import {
  parseInstrumentCommand,
  buildTradeAnalysisPrompt,
  FRONTEND_TASK_TIER_MAP,
  TIER_CREDIT_COST,
  TAB_TO_NEWS_ASSETS,
  buildNewsContextPrefix,
} from "../../../shared/lib/analyzePageHelpers";
import { useSearchParams } from "react-router-dom";

export function useChatStream() {
  const [searchParams] = useSearchParams();
  const symbol = searchParams.get('symbol');
  const { data: allBrokerSymbols = [] } = useBrokerSymbols();
  
  const {
    inputText, setInputText,
    messages, setMessages,
    isStreaming, setIsStreaming,
    activeTab,
    agentTier,
    optimizeEnabled,
    attachedImage, setAttachedImage,
    currentSessionId, setCurrentSessionId,
    setRecentSessions,
    setView
  } = useChatStore();

  const handleSubmit = async () => {
    if (!inputText.trim() || isStreaming) return;
    
    const text = inputText;
    setInputText("");
    setView('chat');
    setIsStreaming(true);

    // 1. Add user message
    setMessages(prev => [
      ...prev, 
      { role: 'user', content: text, image: attachedImage },
      { role: 'agent', content: "", isTyping: true } as any
    ]);
    
    const imageToSend = attachedImage;
    setAttachedImage(null);

    // 2. Extract clean history — normalize 'agent' → 'assistant' (backend only accepts user|assistant)
    const chatHistory = messages.filter((m: any) => !m.isTyping).map((m: any) => ({
      role: m.role === 'agent' ? 'assistant' : m.role,
      content: m.content || "",
      image: m.image
    }));

    // "general" — bukan "faq": enum backend (ChatTaskType) tidak punya "faq",
    // sehingga dulu jatuh ke tier fallback balanced (3 CRD) padahal estimasi FE cheap.
    let taskType = symbol ? "market_insight" : "general";
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
          const result = await fetchOHLC(instrument.symbol, instrument.timeframe);
          const candles = result?.candles ?? [];
          messageToSend = newsPrefix + buildTradeAnalysisPrompt(instrument, candles, text);
        } catch (err: any) {
          messageToSend = newsPrefix + `[DATA PASAR TIDAK TERSEDIA: ${err?.message || "gagal mengambil data MT5"}]\n\nUser meminta analisa ${instrument.symbol} (${instrument.timeframe}) tapi data MT5 gagal diambil. Beritahu user datanya sedang tidak tersedia, JANGAN mengarang harga.\n\n[PERMINTAAN USER]\n${text}`;
        }
      }
    } else if (tabAssets) {
      taskType = "market_insight";
      messageToSend = newsPrefix + text;
    }

    const tierOverride = optimizeEnabled ? undefined : agentTier;

    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID();
      setCurrentSessionId(activeSessionId);
    }

    setRecentSessions(prev => {
      if (prev.find(s => s.sessionId === activeSessionId)) return prev;
      return [
        {
          sessionId: activeSessionId,
          title: text,
          message: text,
          createdAt: new Date().toISOString()
        },
        ...prev
      ].slice(0, 5);
    });

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
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          const last = newMsgs[lastIndex];
          newMsgs[lastIndex] = {
            ...last,
            thinkingTime: `${(result.latencyMs / 1000).toFixed(1)}s`,
            tools: result.modelUsed,
            cost: `-${TIER_CREDIT_COST[tierOverride || FRONTEND_TASK_TIER_MAP[taskType as keyof typeof FRONTEND_TASK_TIER_MAP] || "balanced"]}.0 CRD`,
            isFinishedGlow: true
          };
          return newMsgs;
        });
        setIsStreaming(false);
      },
      (error) => {
        if (flushTimeout) clearTimeout(flushTimeout);
        flushTokens();
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

  return { handleSubmit };
}
