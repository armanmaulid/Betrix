import { useEffect, useRef } from "react";
import { useChatStore, type ChatMessage } from "../store/useChatStore";
import { streamChat, type ChatContextParams } from "../api/chatClient";
import {
  parseInstrumentCommand,
  FRONTEND_TASK_TIER_MAP,
  TIER_CREDIT_COST,
  TAB_TO_NEWS_ASSETS,
} from "../../../shared/lib/analyzePageHelpers";
import { useSearchParams } from "react-router-dom";

// Error code backend (`SYMBOL_NOT_FOUND`, `VALIDATION_ERROR`, dst) → pesan
// user-facing Indonesia. Backend kirim `{ error, code }` sebagai JSON 4xx
// sebelum stream mulai; FE menampilkan pesan bersih, bukan string mentah.
function friendlyError(error: string): string {
  if (error === "SYMBOL_NOT_FOUND") {
    return "Simbol tidak ditemukan di platform broker. Cek popover suggestion saat mengetik '/'.";
  }
  if (error === "VALIDATION_ERROR") {
    return "Input tidak valid (simbol/timeframe/asset). Periksa kembali perintah kamu.";
  }
  if (error === "RATE_LIMITED") {
    return "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.";
  }
  return error;
}

export function useChatStream() {
  // Abort the in-flight stream when the hook's consumer unmounts so the
  // fetch + reader don't keep running after navigating away.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const [searchParams] = useSearchParams();
  const symbol = searchParams.get('symbol');

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
      { role: 'agent', content: "", isTyping: true }
    ]);

    const imageToSend = attachedImage;
    setAttachedImage(null);

    // 2. Extract clean history — normalize 'agent' → 'assistant' (backend only accepts user|assistant)
    const chatHistory = messages.filter((m: ChatMessage) => !m.isTyping).map((m: ChatMessage) => ({
      role: m.role === 'agent' ? 'assistant' : m.role,
      content: m.content || "",
      image: m.image
    }));

    // Konstruksi prompt (candle + instruksi format + konteks berita) SUDAH
    // pindah ke backend. FE hanya kirim `contextParams` terstruktur — data
    // MT5 diambil backend langsung dari broker (lihat
    // docs/backend-prompt-migration-response.md). messageToSend = teks mentah.
    const instrument = parseInstrumentCommand(text);
    const tabAssets = TAB_TO_NEWS_ASSETS[activeTab];

    let taskType = symbol ? "market_insight" : "general";
    let contextParams: ChatContextParams | undefined;

    if (instrument) {
      taskType = "trade_reasoning";
      contextParams = {
        type: "market_analysis",
        symbol: instrument.symbol,
        timeframe: instrument.timeframe,
      };
    } else if (tabAssets) {
      taskType = "market_insight";
      contextParams = {
        type: "news_context",
        assets: tabAssets,
      };
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

    const abortController = new AbortController();
    abortRef.current = abortController;

    streamChat(
      text,
      text,
      chatHistory,
      taskType,
      activeSessionId,
      tierOverride,
      imageToSend,
      contextParams,
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
            content: last.content ? last.content + `\n\n[Error: ${friendlyError(error)}]` : `Error: ${friendlyError(error)}`,
            isTyping: false
          };
          return newMsgs;
        });
        setIsStreaming(false);
      },
      abortController.signal
    );
  };

  return { handleSubmit };
}
