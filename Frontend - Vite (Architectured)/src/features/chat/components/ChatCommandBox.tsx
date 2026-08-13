import React, { useRef, useState, useEffect } from "react";
import { ChevronDown, Globe, Leaf, Paperclip, Sparkles, X, ArrowRight } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useChatStream } from "../hooks/useChatStream";
import { useBrokerSymbols } from "../../market/api/queries";
import {
  CHAT_SHORTCUTS,
  INSTRUMENT_COMMANDS,
  AGENT_TIER_LABEL,
  TIER_CREDIT_COST
} from "../../../shared/lib/analyzePageHelpers";
import { type BrokerSymbol } from "../../market/api/marketClient";

export function ChatCommandBox({ isChat = false }: { isChat?: boolean }) {
  const {
    inputText, setInputText,
    isStreaming,
    activeTab, setActiveTab,
    agentTier, setAgentTier,
    optimizeEnabled, setOptimizeEnabled,
    webSearchEnabled, setWebSearchEnabled,
    attachedImage, setAttachedImage
  } = useChatStore();

  const { handleSubmit } = useChatStream();
  const { data: allBrokerSymbols = [] } = useBrokerSymbols();
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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

  const showCommands = inputText.startsWith('/') && !inputText.includes(' ');
  const filteredShortcuts = inputText.length > 1 && showCommands
    ? CHAT_SHORTCUTS.filter(s => s.cmd.toLowerCase().includes(inputText.toLowerCase().trim()))
    : CHAT_SHORTCUTS;

  let suggestedSymbols: BrokerSymbol[] = [];
  let symbolSearchPrefix = "";
  const symbolMatch = inputText.match(/^\/(\w+)\s+(\S*)$/);
  if (symbolMatch && INSTRUMENT_COMMANDS.includes(symbolMatch[1].toLowerCase())) {
    const cmd = symbolMatch[1].toLowerCase();
    const query = symbolMatch[2].toLowerCase();
    symbolSearchPrefix = `/${cmd} `;
    
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

  return (
    <div 
      className={`flex flex-col border-[#222] bg-[#0a0a0a] ${isChat ? 'border-t shrink-0' : 'border rounded-sm mt-1 shadow-[0_4px_24px_rgba(0,0,0,0.5)]'}`}
      onClick={() => inputRef.current?.focus()}
    >
      {/* TABS */}
      <div className={`flex items-center gap-4 ${isChat ? 'page-container pt-3' : 'page-container pt-2'}`}>
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
      <div className="flex items-center page-container py-3 gap-3 group cursor-text relative">
        
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
            onClick={() => setWebSearchEnabled((v: boolean) => !v)}
            title="Search Web (belum aktif di backend, lihat catatan tim)"
            className={`p-1 rounded-sm transition-opacity hover:opacity-80 ${webSearchEnabled ? "bg-[#00ffff] text-black" : "bg-[#00ffff]/30 text-[#00ffff]"}`}
          >
            <Globe size={14} />
          </button>
        </div>
      </div>

      {/* BOTTOM TOOLBAR */}
      <div className="flex items-center justify-between page-container py-2 border-t border-[#222] bg-[#080808]">
        <span className="text-[10px] text-[#555]">Type <span className="text-[#888]">/</span> for commands</span>
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOptimizeEnabled((v: boolean) => !v)}
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
              Agent : <span className={optimizeEnabled ? "text-[#666]" : "text-[#00ffff]"}>{AGENT_TIER_LABEL[agentTier as keyof typeof AGENT_TIER_LABEL]}</span>
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
}
