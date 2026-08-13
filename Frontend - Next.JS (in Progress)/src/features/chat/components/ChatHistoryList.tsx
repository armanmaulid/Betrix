"use client";

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

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const prevSessions = recentSessions;
    setRecentSessions(prev => prev.filter(s => (s.session_id || s.id) !== sessionId));
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
    return <div className="text-[#555] text-[11px] italic page-container py-2">No recent sessions found.</div>;
  }

  return (
    <>
      {recentSessions.map((session: any) => (
        <div key={session.session_id || session.id} className="flex items-center justify-between border border-[#222] bg-[#0a0a0a] page-container py-2 group hover:border-[#444] transition-colors shadow-sm mt-1">
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
      ))}
    </>
  );
}
