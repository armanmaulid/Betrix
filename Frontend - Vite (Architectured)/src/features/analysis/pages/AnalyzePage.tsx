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
import { CHAT_TEMPLATES, deriveCommands } from "../../../shared/lib/analyzePageHelpers";
import { useBrokerSymbols } from "../../market/api/queries";
import { useChatStore } from "../../chat/store/useChatStore";
import { ChatCommandBox } from "../../chat/components/ChatCommandBox";
import { ChatHistoryList } from "../../chat/components/ChatHistoryList";

export function AnalyzePage() {
  const { setRightPanel, setOnSearch } = useShellContext();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const symbol = searchParams.get('symbol');
  const { data: allBrokerSymbols = [] } = useBrokerSymbols();

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
      <div className="flex flex-col flex-1 bg-[var(--bg)] overflow-hidden font-mono text-[13px] text-[var(--text-primary)]">

        {view === 'landing' ? (
          <div className="w-full py-4 flex flex-col gap-5 overflow-y-auto">
            {/* SHORTCUTS */}
            <div className="flex flex-col gap-2">
              <h2 className="text-[var(--info)] font-bold tracking-widest text-[11px]">PERINTAH {'>'}</h2>
              <div className="grid grid-cols-3 gap-y-1 gap-x-2">
                {deriveCommands(allBrokerSymbols).map(s => (
                  <div key={s.cmd} className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-[var(--accent)] font-bold">{s.cmd}</span>
                    <span className="text-[var(--text-muted)]">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* GREETING & COMMAND BOX */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bot className="text-[var(--text-primary)]" size={28} />
                  <h1 className="text-lg text-[var(--text-primary)] font-medium tracking-wide">
                    Hai {user?.name?.split(' ')[0] || "Ammarcyber"}, yuk tinjau pergerakan market hari ini{symbol ? ` untuk ${symbol}` : ''}.
                  </h1>
                </div>
                <button className="flex items-center gap-2 px-3 py-1 border border-[var(--border)] hover:border-[var(--accent)] transition-colors">
                  <CircleUser size={14} className="text-[var(--accent)]" />
                  <span className="text-[var(--accent)] text-[10px] font-bold uppercase">{user?.name || "Manks"}</span>
                </button>
              </div>

              <ChatCommandBox isChat={false} />
            </div>

            {/* WORKFLOW */}
            <div className="flex flex-col gap-2 mt-1">
              <h2 className="text-[var(--info)] font-bold tracking-widest text-[11px]">ALUR KERJA {'>'}</h2>
              <button className="flex items-center gap-1 text-[11px] font-bold text-[var(--text-primary)] w-fit hover:opacity-80 transition-opacity">
                Template Disarankan <ChevronDown size={12} />
              </button>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {CHAT_TEMPLATES.map((t, idx) => (
                  <div key={idx} className="bx-box-interactive p-3 flex flex-col gap-1.5 cursor-pointer">
                    <div className="flex items-start gap-1.5 text-[var(--accent)] font-bold text-[11px]">
                      <Star size={12} className="mt-[1px] shrink-0 fill-[var(--accent)]" />
                      <span className="leading-tight">{t.title}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                      {t.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* PRIVATE DATAROOM */}
            <div className="flex flex-col gap-2 mt-1">
              <h2 className="text-[var(--info)] font-bold tracking-widest text-[11px]">RUANG DATA {'>'}</h2>
              <div className="bx-box-interactive flex items-center justify-between page-container py-3 cursor-pointer">
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <Lock size={14} className="text-[var(--accent)]" />
                  <span className="text-[11px]">Belum ada dokumen diunggah. Klik untuk buka ruang data.</span>
                </div>
                <span className="text-[var(--accent)] text-[10px] font-bold tracking-widest">BUKA {'>'}</span>
              </div>
            </div>

            {/* RECENT SESSIONS */}
            <div className="flex flex-col gap-2 mt-1 mb-6">
              <h2 className="text-[var(--info)] font-bold tracking-widest text-[11px]">SESI TERBARU {'>'}</h2>
              <ChatHistoryList />
            </div>
          </div>
        ) : (
          /* ACTIVE CHAT VIEW */
          <div className="flex flex-col flex-1 overflow-hidden relative animate-slide-up-fade">

            {/* TOP BAR */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] py-2 shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={() => {setMessages([]); setView('landing'); setCurrentSessionId(null);}} className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border)] px-2 py-1">
                  <ArrowLeft size={10} /> BACK
                </button>
                <div className="flex items-center">
                  <span className="bg-[var(--accent)] text-black text-[9px] font-bold px-2 py-1">CHAT</span>
                  <span className="text-[var(--text-muted)] text-[10px] font-bold ml-3">{messages.length} msgs</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExport} className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--info)] transition-colors border border-[var(--border)] px-2 py-1">
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
