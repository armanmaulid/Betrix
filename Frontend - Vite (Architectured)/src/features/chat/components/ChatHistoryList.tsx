import { useEffect } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { getChatHistory, deleteChatSession } from "../api/chatClient";

export function ChatHistoryList() {
  const {
    recentSessions, setRecentSessions,
    setCurrentSessionId,
    setMessages,
    setView,
    view
  } = useChatStore();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const loadSession = (session: any) => {
    setCurrentSessionId(session.sessionId);
    if (session.turns && Array.isArray(session.turns)) {
      setMessages(
        session.turns.flatMap((turn: any) => [
          { role: 'user', content: turn.message },
          { 
            role: 'agent', 
            content: turn.reply || "...", 
            tools: turn.modelUsed,
            thinkingTime: turn.latencyMs ? `${(turn.latencyMs / 1000).toFixed(1)}s` : undefined,
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
          tools: session.modelUsed,
          thinkingTime: session.latencyMs ? `${(session.latencyMs / 1000).toFixed(1)}s` : undefined,
          isTyping: false
        }
      ]);
    }
    setView('chat');
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const prevSessions = recentSessions;
    setRecentSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    deleteChatSession(sessionId)
      .then(() => {
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

  if (recentSessions.length === 0) {
    return <div className="text-[var(--text-muted)] text-[11px] italic page-container py-2">Belum ada sesi terbaru.</div>;
  }

  return (
    <>
      {recentSessions.map((session: any) => (
        <div key={session.sessionId} className="bx-box-interactive flex items-center justify-between page-container py-3 group">
          <div className="flex items-center gap-2 text-[var(--text-primary)] w-full max-w-[80%]">
            <MessageSquare size={14} className="text-[var(--accent)] shrink-0" />
            <span onClick={() => loadSession(session)} className="text-[11px] truncate hover:opacity-80 cursor-pointer transition-opacity w-full">
              {session.title || (session.turns && session.turns[0]?.message)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[var(--text-muted)] text-[10px]">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[var(--accent)] font-bold">Q</span>
              <span>{timeAgo(session.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => handleDeleteSession(e, session.sessionId)}
                className="hover:text-[var(--danger)] transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
