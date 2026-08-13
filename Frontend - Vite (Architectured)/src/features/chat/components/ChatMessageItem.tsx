import React, { useState } from "react";
import { Globe, Copy, FileText, ChevronRight, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { markdownComponents } from "../../../shared/lib/analyzePageHelpers";

export const ChatMessageItem = React.memo(({ msg }: { msg: any }) => {
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
          className="opacity-0 group-hover:opacity-100 p-1.5 text-[#555] hover:text-[#fff] transition-all mr-1 self-center"
          title="Copy"
        >
          {isCopied ? <Check size={14} className="text-[#00ff99]" /> : <Copy size={14} />}
        </button>
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          {msg.image && (
            <img src={msg.image} alt="User attachment" className="rounded-sm max-h-48 object-contain bg-[#111] p-1 border border-[#333] shadow-lg" />
          )}
          {msg.content && (
            <div className="bg-[#ff9900] text-black font-bold px-4 py-2 rounded-sm text-[12px] whitespace-pre-wrap shadow-lg">
              {msg.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (msg.isTyping) {
    return (
      <div className="flex flex-col w-full max-w-4xl gap-3" style={{ contain: 'layout' }}>
        <div className="flex flex-col border border-[#333] bg-[#0a0a0a] rounded-sm p-5 shadow-lg">
          <div className="flex items-center gap-3 text-[#ff9900] font-bold text-[11px] animate-pulse">
            <Globe size={14} className="animate-spin" /> 
            <span>Agent is analyzing market data and executing tools...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-4xl gap-3" style={{ contain: 'layout' }}>
      <div className={`flex flex-col border border-[#333] bg-[#0a0a0a] rounded-sm shadow-lg ${msg.isFinishedGlow ? 'animate-ai-glow' : ''}`}>
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
          <button 
            onClick={handleCopy}
            className="flex items-center gap-1.5 border border-[#333] px-2 py-1 text-[9px] font-bold text-[#888] hover:text-[#00ff99] hover:border-[#00ff99] rounded-sm transition-colors"
          >
            {isCopied ? <Check size={10} /> : <Copy size={10} />} 
            {isCopied ? 'COPIED' : 'COPY'}
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-1.5 border border-[#333] px-2 py-1 text-[9px] font-bold text-[#888] hover:text-white rounded-sm transition-colors"
            title="Save as Markdown (.md)"
          >
            <FileText size={10} /> SAVE
          </button>
        </div>
      </div>
    </div>
  );
});

