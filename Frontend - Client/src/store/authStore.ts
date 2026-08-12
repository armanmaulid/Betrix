import { create } from 'zustand';
import * as authApi from '../lib/api/authClient';
import type { AuthUser } from '../lib/api/authClient';

const STORAGE_KEY = 'eaconsole.sessionToken';

interface AuthState {
  user: AuthUser | null;
  sessionToken: string | null;
  isLoading: boolean;
  isConnected: boolean;
  
  setUser: (user: AuthUser | null) => void;
  setSessionToken: (token: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsConnected: (isConnected: boolean) => void;
  
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  initStream: () => void;
}

// Hold the EventSource instance so we can close it when needed
let authEventSource: EventSource | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  sessionToken: typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null,
  isLoading: true,
  isConnected: false,

  setUser: (user) => set({ user }),
  setSessionToken: (sessionToken) => {
    set({ sessionToken });
    if (typeof window !== 'undefined') {
      if (sessionToken) {
        localStorage.setItem(STORAGE_KEY, sessionToken);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  },
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsConnected: (isConnected) => set({ isConnected }),

  login: async (email, password) => {
    const result = await authApi.login(email, password);
    get().setSessionToken(result.sessionToken);
    set({ user: result.user });
    get().initStream();
  },

  loginWithToken: async (token) => {
    get().setSessionToken(token);
    const { user } = await authApi.fetchMe(token);
    set({ user });
    get().initStream();
  },

  logout: async () => {
    const { sessionToken } = get();
    if (authEventSource) {
      authEventSource.close();
      authEventSource = null;
    }
    
    // Attempt backend logout if token exists
    if (sessionToken) {
      await authApi.logout(sessionToken).catch(() => {});
    }
    
    get().setSessionToken(null);
    set({ user: null, isConnected: false });
    
    // Broadcast logout event if needed (e.g. for other streams)
    import('../lib/authEvents').then(({ emitLogout }) => {
      emitLogout();
    });
  },

  restoreSession: async () => {
    const { sessionToken } = get();
    if (!sessionToken) {
      set({ isLoading: false });
      return;
    }
    try {
      const { user } = await authApi.fetchMe(sessionToken);
      set({ user });
      get().initStream();
    } catch (err) {
      // Invalid token
      get().setSessionToken(null);
      set({ user: null });
    } finally {
      set({ isLoading: false });
    }
  },

  initStream: () => {
    const { sessionToken, user } = get();
    if (!sessionToken || !user || typeof window === 'undefined') return;

    if (authEventSource) {
      authEventSource.close();
    }

    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const es = new EventSource(`${BACKEND_URL}/api/auth/me/stream?token=${sessionToken}`);
    authEventSource = es;

    es.onopen = () => set({ isConnected: true });
    es.onerror = () => set({ isConnected: false });

    es.addEventListener('credits_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        set((state) => ({
          user: state.user ? { ...state.user, credits: data.credits } : null,
        }));
      } catch (err) {
        console.error('Failed to parse credits_update');
      }
    });

    es.addEventListener('logout', () => {
      get().logout();
    });
  },
}));
