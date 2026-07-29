import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../api/authClient";
import type { AuthUser } from "../api/authClient";

// Only the session token lives in localStorage — user profile is always
// re-fetched from /api/auth/me on load rather than cached, so a change made
// server-side (e.g. admin bans the account) is picked up on next refresh
// instead of trusting stale localStorage data.
const STORAGE_KEY = "eaconsole.sessionToken";

interface AuthContextValue {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  isLoading: boolean;
  isConnected: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  // Starts true so ProtectedRoute doesn't flash a redirect-to-login before
  // we've had a chance to check whether a stored token is still valid.
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!sessionToken) {
        setIsLoading(false);
        return;
      }
      try {
        const { user: restoredUser } = await authApi.fetchMe(sessionToken);
        if (!cancelled) setUser(restoredUser);
      } catch {
        // Token expired/invalid — clear it so we don't keep retrying every render.
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setSessionToken(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
    // Only run on mount — sessionToken changes are driven by login/logout
    // below, which manage user state themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionToken || !user) return;

    const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const es = new EventSource(`${BACKEND_URL}/api/auth/me/stream?token=${sessionToken}`);

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    es.addEventListener('credits_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        setUser(prev => prev ? { ...prev, credits: data.credits } : prev);
      } catch (err) {
        console.error("Failed to parse credits_update");
      }
    });

    es.addEventListener('logout', () => {
      // Sesi ini dicabut paksa (misal dari menu Revoke di browser lain).
      // Langsung hapus state lokal dan arahkan ke login.
      localStorage.removeItem(STORAGE_KEY);
      setSessionToken(null);
      setUser(null);
    });

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [sessionToken, user?.id]);

  async function login(email: string, password: string) {
    const result = await authApi.login(email, password); // throws AuthApiError on failure
    localStorage.setItem(STORAGE_KEY, result.sessionToken);
    setSessionToken(result.sessionToken);
    setUser(result.user);
  }

  async function loginWithToken(token: string) {
    localStorage.setItem(STORAGE_KEY, token);
    setSessionToken(token);
    const { user: fetchedUser } = await authApi.fetchMe(token);
    setUser(fetchedUser);
  }

  async function logout() {
    if (sessionToken) {
      // Best-effort — even if this network call fails, forget the token
      // locally so the user isn't stuck "logged in" on this device.
      await authApi.logout(sessionToken).catch(() => {});
    }
    localStorage.removeItem(STORAGE_KEY);
    setSessionToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, isConnected, login, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() harus dipakai di dalam <AuthProvider>");
  return ctx;
}
