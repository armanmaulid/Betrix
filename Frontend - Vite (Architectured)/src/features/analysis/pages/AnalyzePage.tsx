import { useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useShellContext } from "../../../app/layout/TerminalShellLayout";
import { useAuth } from "../../auth/context/AuthContext";
import { 
  Bot, 
  CircleUser, 
  ChevronDown,
  Lock,
  Star,
  ArrowLeft,
  Download,
} from "lucide-react";
import { NewsFeed } from "../../news/components/NewsFeed";
import { EconomicCalendar } from "../../market/components/EconomicCalendar";
import { ChatMessageItem } from "../../chat/components/ChatMessageItem";
import { CHAT_SHORTCUTS, CHAT_TEMPLATES } from "../../../shared/lib/analyzePageHelpers";
import { useChatStore } from "../../chat/store/useChatStore";
import { ChatCommandBox } from "../../chat/components/ChatCommandBox";
import { ChatHistoryList } from "../../chat/components/ChatHistoryList";

export function AnalyzePage() {
  const { setRightPanel, setOnSearch } = useShellContext();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const symbol = searchParams.get('symbol');
  
  const { view, setView, messages, setMessages, setCurrentSessionId } = useChatStore();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Autoscroll dimatikan sepenuhnya atas permintaan user
  }, [view]);

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
          <div className="w-full py-4 flex flex-col gap-5 overflow-y-auto">
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

              <ChatCommandBox isChat={false} />
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
              <div className="flex items-center justify-between border border-[#222] bg-[#0a0a0a] page-container py-3 cursor-pointer hover:border-[#444] transition-colors shadow-sm">
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
              <ChatHistoryList />
            </div>
          </div>
        ) : (
          /* ACTIVE CHAT VIEW */
          <div className="flex flex-col flex-1 overflow-hidden relative animate-slide-up-fade">
            
            {/* TOP BAR */}
            <div className="flex items-center justify-between border-b border-[#222] bg-[#0a0a0a] py-2 shrink-0">
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
                <button onClick={handleExport} className="flex items-center gap-1.5 text-[9px] font-bold text-[#888] hover:text-[#00ffff] transition-colors border border-[#333] px-2 py-1 rounded-sm">
                  <Download size={10} /> EXPORT
                </button>
              </div>
            </div>

            {/* MESSAGES AREA */}
            <div className="flex-1 overflow-y-auto px-1 py-4 scroll-smooth">
              <div className="flex flex-col gap-6 w-full px-4 pb-4">
                {messages.map((msg: any, idx: number) => (
                  <ChatMessageItem
                    key={idx}
                    msg={msg}
                  />
                ))}
                {/* INVISIBLE ELEMENT FOR SCROLLING */}
                <div ref={messagesEndRef} className="h-4 w-full opacity-0 pointer-events-none" />
              </div>
            </div>

            <ChatCommandBox isChat={true} />
          </div>
        )}
      </div>
    </>
  );
}
