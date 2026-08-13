import { create } from "zustand";

interface ChatState {
  inputText: string;
  setInputText: (text: string) => void;

  messages: any[];
  setMessages: (updater: any[] | ((prev: any[]) => any[])) => void;

  isStreaming: boolean;
  setIsStreaming: (isStreaming: boolean) => void;

  activeTab: string;
  setActiveTab: (tab: string) => void;

  agentTier: "cheap" | "balanced" | "deep";
  setAgentTier: (tier: "cheap" | "balanced" | "deep") => void;

  optimizeEnabled: boolean;
  setOptimizeEnabled: (val: boolean | ((prev: boolean) => boolean)) => void;

  webSearchEnabled: boolean;
  setWebSearchEnabled: (val: boolean | ((prev: boolean) => boolean)) => void;

  attachedImage: string | null;
  setAttachedImage: (img: string | null) => void;

  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;

  recentSessions: any[];
  setRecentSessions: (updater: any[] | ((prev: any[]) => any[])) => void;

  view: 'landing' | 'chat';
  setView: (view: 'landing' | 'chat') => void;
}

export const useChatStore = create<ChatState>((set) => ({
  inputText: "",
  setInputText: (text) => set({ inputText: text }),

  messages: [],
  setMessages: (updater) => set((state) => ({ 
    messages: typeof updater === "function" ? updater(state.messages) : updater 
  })),

  isStreaming: false,
  setIsStreaming: (isStreaming) => set({ isStreaming }),

  activeTab: "AUTO",
  setActiveTab: (activeTab) => set({ activeTab }),

  agentTier: "cheap",
  setAgentTier: (agentTier) => set({ agentTier }),

  optimizeEnabled: true,
  setOptimizeEnabled: (val) => set((state) => ({
    optimizeEnabled: typeof val === "function" ? val(state.optimizeEnabled) : val
  })),

  webSearchEnabled: false,
  setWebSearchEnabled: (val) => set((state) => ({
    webSearchEnabled: typeof val === "function" ? val(state.webSearchEnabled) : val
  })),

  attachedImage: null,
  setAttachedImage: (attachedImage) => set({ attachedImage }),

  currentSessionId: null,
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),

  recentSessions: [],
  setRecentSessions: (updater) => set((state) => ({
    recentSessions: typeof updater === "function" ? updater(state.recentSessions) : updater
  })),

  view: 'landing',
  setView: (view) => set({ view }),
}));
