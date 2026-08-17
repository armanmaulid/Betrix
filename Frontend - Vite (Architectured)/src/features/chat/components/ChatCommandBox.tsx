import React, { useRef, useState, useEffect } from "react";
import { ChevronDown, Leaf, Paperclip, Sparkles, X, ArrowRight, AlertTriangle } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useChatStream } from "../hooks/useChatStream";
import { useBrokerSymbols } from "../../market/api/queries";
import {
  INSTRUMENT_COMMANDS,
  AGENT_TIER_LABEL,
  TIER_CREDIT_COST,
  symbolMatchesCommand,
  deriveCommands,
} from "../../../shared/lib/analyzePageHelpers";
import { type BrokerSymbol } from "../../market/api/marketClient";

export function ChatCommandBox({ isChat = false }: { isChat?: boolean }) {
  const {
    inputText, setInputText,
    isStreaming,
    activeTab, setActiveTab,
    agentTier, setAgentTier,
    optimizeEnabled, setOptimizeEnabled,
    attachedImage, setAttachedImage
  } = useChatStore();

  const { handleSubmit } = useChatStream();
  const { data: allBrokerSymbols = [] } = useBrokerSymbols();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError(`Ukuran gambar terlalu besar! Maksimal ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`);
        e.target.value = '';
        return;
      }
      setUploadError(null);
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

  const shortcuts = deriveCommands(allBrokerSymbols);
  const showCommands = inputText.startsWith('/') && !inputText.includes(' ');
  const filteredShortcuts = inputText.length > 1 && showCommands
    ? shortcuts.filter(s => s.cmd.toLowerCase().includes(inputText.toLowerCase().trim()))
    : shortcuts;

  let suggestedSymbols: BrokerSymbol[] = [];
  let symbolSearchPrefix = "";
  const symbolMatch = inputText.match(/^\/(\w+)\s+(\S*)$/);
  if (symbolMatch && INSTRUMENT_COMMANDS.includes(symbolMatch[1].toLowerCase())) {
    const cmd = symbolMatch[1].toLowerCase();
    const query = symbolMatch[2].toLowerCase();
    symbolSearchPrefix = `/${cmd} `;

    const categoryFiltered = allBrokerSymbols.filter(s =>
      symbolMatchesCommand(s.path || "", cmd)
    );

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
      className={`flex flex-col border-[var(--border)] bg-[var(--surface)] ${isChat ? 'border-t shrink-0' : 'border mt-1'}`}
      onClick={() => inputRef.current?.focus()}
    >
      {/* TABS */}
      <div className={`flex items-center gap-4 ${isChat ? 'page-container pt-3' : 'page-container pt-2'}`}>
        <div className="flex border border-[var(--border)] text-[9px] font-bold tracking-wider overflow-hidden bg-[var(--surface-alt)]">
          {["AUTO", "EQUITY", "MACRO", "NEWS"].map(tab => (
            <button
              key={tab}
              onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
              className={`px-3 py-0.5 transition-colors ${activeTab === tab ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
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
          <div className="bx-box absolute bottom-full left-10 mb-2 w-64 overflow-hidden z-50">
            <div className="px-3 py-1.5 bg-[var(--surface-alt)] border-b border-[var(--border)] text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
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
                  className={`flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--surface-alt)] transition-colors ${i !== filteredShortcuts.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
                >
                  <span className="text-[var(--accent)] font-bold text-[11px]">{s.cmd}</span>
                  <span className="text-[var(--text-muted)] text-[10px]">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SYMBOL POPOVER */}
        {symbolSearchPrefix && suggestedSymbols.length > 0 && (
          <div className="bx-box absolute bottom-full left-10 mb-2 w-72 overflow-hidden z-50">
            <div className="px-3 py-1.5 bg-[var(--surface-alt)] border-b border-[var(--border)] text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
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
                  className={`flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--surface-alt)] transition-colors ${i !== suggestedSymbols.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
                >
                  <span className="text-[var(--info)] font-bold text-[11px]">{s.symbol}</span>
                  <span className="text-[var(--text-muted)] text-[10px] truncate max-w-[140px] text-right" title={s.description}>{s.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {attachedImage && (
          <div className="relative p-1 bg-[var(--surface-alt)] border border-[var(--border)] group flex-shrink-0">
            <img src={attachedImage} alt="Attachment" className="h-12 w-12 object-cover" />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-[var(--danger)] text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        )}

        <span className="text-[var(--accent)] font-bold text-lg leading-none mt-1">{'>'}</span>
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
          placeholder={isStreaming ? "Menunggu balasan agen..." : isChat ? "Lanjutkan..." : "Minta agen mulai alur kerja kamu"}
          className="flex-1 bg-transparent outline-none ring-0 border-none focus:outline-none focus:ring-0 focus:border-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-[14px] resize-none overflow-y-auto min-h-[24px] max-h-[120px] leading-relaxed py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-1.5 self-end pb-1">
          <button
            onClick={() => { setAgentTier("cheap"); setOptimizeEnabled(false); }}
            title="Mode Lite (respons cepat, kredit paling murah)"
            aria-label="Mode Lite (respons cepat, kredit paling murah)"
            className={`p-1 transition-opacity hover:opacity-80 ${!optimizeEnabled && agentTier === "cheap" ? "bg-[var(--success)] text-black" : "bg-[var(--success-soft)] text-[var(--success)]"}`}
          >
            <Leaf size={14} />
          </button>
        </div>
      </div>

      {uploadError && (
        <div role="alert" className="page-container pb-2">
          <div className="flex items-center gap-1.5 border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-[10px] text-[var(--danger)]">
            <AlertTriangle size={10} className="flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        </div>
      )}

      {/* BOTTOM TOOLBAR */}
      <div className="flex items-center justify-between page-container py-2 border-t border-[var(--border)] bg-[var(--surface-alt)]">
        <span className="text-[10px] text-[var(--text-muted)]">Ketik <span className="text-[var(--text-muted)]">/</span> untuk perintah</span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOptimizeEnabled((v: boolean) => !v)}
            title={optimizeEnabled ? "Optimize aktif: tier model dipilih otomatis" : "Optimize mati: pakai tier manual dari dropdown Agent"}
            className={`flex items-center gap-1 border px-2 py-0.5 text-[10px] transition-colors ${optimizeEnabled ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]"}`}
          >
            <Sparkles size={11} />
            Optimize
          </button>
          <div className="relative" ref={agentMenuRef}>
            <button
              onClick={() => setShowAgentMenu(v => !v)}
              title={optimizeEnabled ? "Optimize aktif -- matikan dulu untuk pakai tier manual ini" : "Pilih tier model manual"}
              className="flex items-center gap-1 border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
            >
              Agent : <span className={optimizeEnabled ? "text-[var(--text-muted)]" : "text-[var(--info)]"}>{AGENT_TIER_LABEL[agentTier as keyof typeof AGENT_TIER_LABEL]}</span>
              <ChevronDown size={10} className="ml-0.5" />
            </button>
            {showAgentMenu && (
              <div className="bx-box absolute bottom-full right-0 mb-1 w-36 z-10 overflow-hidden">
                {(["cheap", "balanced", "deep"] as const).map(tier => (
                  <button
                    key={tier}
                    onClick={() => { setAgentTier(tier); setOptimizeEnabled(false); setShowAgentMenu(false); }}
                    className={`flex w-full items-center justify-between px-2 py-1.5 text-[10px] hover:bg-[var(--surface)] transition-colors ${agentTier === tier ? "text-[var(--info)]" : "text-[var(--text-muted)]"}`}
                  >
                    {AGENT_TIER_LABEL[tier]}
                    <span className="text-[var(--text-muted)]">{TIER_CREDIT_COST[tier]} CRD</span>
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
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-1"
          >
            <Paperclip size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
            disabled={isStreaming}
            className="p-1 bg-[var(--accent)] text-black hover:opacity-80 transition-opacity ml-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
