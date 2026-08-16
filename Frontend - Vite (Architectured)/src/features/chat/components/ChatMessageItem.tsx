import React, { useState } from "react";
import { Globe, Copy, FileText, ChevronRight, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { markdownComponents } from "../../../shared/lib/analyzePageHelpers";
import { type ChatMessage } from "../store/useChatStore";

export const ChatMessageItem = React.memo(({ msg }: { msg: ChatMessage }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSave = () => {
    const blob = new Blob([msg.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `betrix-analysis-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end group" style={{ contain: 'layout' }}>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all mr-1 self-center"
          title="Copy"
        >
          {isCopied ? <Check size={14} className="text-[var(--success)]" /> : <Copy size={14} />}
        </button>
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          {msg.image && (
            <img src={msg.image} alt="User attachment" className="max-h-48 object-contain bg-[var(--surface-alt)] p-1 border border-[var(--border)]" />
          )}
          {msg.content && (
            <div className="bg-[var(--accent)] text-black font-bold px-4 py-2 text-[12px] whitespace-pre-wrap">
              {msg.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (msg.isTyping) {
    return (
      <div className="flex flex-col w-full max-w-[85%] gap-3 self-start" style={{ contain: 'layout' }}>
        <div className="bx-box flex flex-col p-5">
          <div className="flex items-center gap-3 text-[var(--accent)] font-bold text-[11px] animate-pulse">
            <Globe size={14} className="animate-spin" />
            <span>Agen sedang menganalisis data market dan menjalankan tools...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-[85%] gap-3 self-start" style={{ contain: 'layout' }}>
      <div className={`bx-box flex flex-col ${msg.isFinishedGlow ? 'animate-ai-glow' : ''}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold text-[11px]">
            <ChevronRight size={12} className="text-[var(--accent)]" /> Pemikiran Agen
          </div>
          <span className="text-[var(--text-muted)] text-[10px] font-bold">
            {msg.thinkingTime}
            {msg.cost && <span className="ml-2 text-[var(--danger)]">{msg.cost}</span>}
          </span>
        </div>
        <div className="px-5 py-4 text-[var(--text-primary)] leading-relaxed text-[12px]">
          <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
        </div>
        <div className="flex justify-end gap-2 px-4 py-2 border-t border-[var(--border)]">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 border border-[var(--border)] px-2 py-1 text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--success)] hover:border-[var(--success)] transition-colors"
          >
            {isCopied ? <Check size={10} /> : <Copy size={10} />}
            {isCopied ? 'COPIED' : 'COPY'}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 border border-[var(--border)] px-2 py-1 text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Save as Markdown (.md)"
          >
            <FileText size={10} /> SAVE
          </button>
        </div>
      </div>
    </div>
  );
});
