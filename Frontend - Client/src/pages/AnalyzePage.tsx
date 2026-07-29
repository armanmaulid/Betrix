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
  CheckSquare, 
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
import { streamChat, getChatHistory } from "../api/chatClient";

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

  const handleSubmit = () => {
    if (!inputText.trim()) return;
    
    const text = inputText;
    setInputText("");
    setView('chat');

    // 1. Add user message and a loading agent message
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
    const taskType = symbol ? "market_insight" : "faq";

    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID();
      setCurrentSessionId(activeSessionId);
    }

    // 3. Optimistically update RECENT SESSIONS immediately
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

    // 4. Connect to backend stream
    streamChat(
      text, 
      chatHistory, 
      taskType,
      activeSessionId,
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
            cost: taskType === "market_insight" ? "-1.0 CRD" : undefined
          };
          return newMsgs;
        });
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
      }
    );
  };

  useEffect(() => {
    if (view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, view]);

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

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const showCommands = inputText.startsWith('/');
  const filteredShortcuts = inputText.length > 1 
    ? shortcuts.filter(s => s.cmd.toLowerCase().includes(inputText.toLowerCase().trim()))
    : shortcuts;

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

        <span className="text-[#ff9900] font-bold text-lg leading-none mt-1">{'>'}</span>
        <textarea 
          ref={inputRef}
          rows={1}
          value={inputText}
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
          placeholder={isChat ? "Follow up..." : "Ask your Agent to start your workflow"}
          className="flex-1 bg-transparent outline-none ring-0 border-none focus:outline-none focus:ring-0 focus:border-transparent text-[#eee] placeholder-[#555] text-[14px] resize-none overflow-y-auto min-h-[24px] max-h-[120px] leading-relaxed py-1"
        />
        <div className="flex items-center gap-1.5 self-end pb-1">
          <button className="p-1 bg-[#00ff99] text-black hover:opacity-80 rounded-sm transition-opacity">
            <Leaf size={14} />
          </button>
          <button className="p-1 bg-[#00ffff] text-black hover:opacity-80 rounded-sm transition-opacity">
            <Globe size={14} />
          </button>
        </div>
      </div>

      {/* BOTTOM TOOLBAR */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[#222] bg-[#080808]">
        <span className="text-[10px] text-[#555]">Type <span className="text-[#888]">/</span> for commands</span>
        
        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-1 border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-[#ccc] hover:border-[#555] rounded-sm transition-colors">
            <Sparkles size={11} />
            Optimize
          </button>
          <button className="flex items-center gap-1 border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-[#ccc] hover:border-[#555] rounded-sm transition-colors">
            <CheckSquare size={11} />
            Approve Trades
          </button>
          <button className="flex items-center gap-1 border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-[#ccc] hover:border-[#555] rounded-sm transition-colors">
            Agent : <span className="text-[#00ffff]">Lite</span>
            <ChevronDown size={10} className="ml-0.5" />
          </button>
          <button className="p-1 text-[#666] hover:text-[#ccc] transition-colors ml-1">
            <Paperclip size={14} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleSubmit(); }} 
            className="p-1 bg-[#ff9900] text-black hover:opacity-80 rounded-sm transition-opacity ml-1"
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
                        <button className="hover:text-[#ff4444] transition-colors"><Trash2 size={12} /></button>
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
                <button onClick={() => setView('landing')} className="flex items-center gap-1.5 text-[9px] font-bold text-[#888] hover:text-white transition-colors border border-[#333] px-2 py-1 rounded-sm">
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
                          {msg.thinkingTime} • {msg.tools} 
                          {msg.cost && <span className="ml-2 text-[#ff4444]">{msg.cost}</span>}
                        </span>
                      </div>
                      <div className="px-5 py-4 text-[#eee] leading-relaxed text-[12px]">
                        {msg.content}
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
