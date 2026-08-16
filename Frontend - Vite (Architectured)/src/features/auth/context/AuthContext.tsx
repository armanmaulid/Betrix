import { createContext, useContext, useCallback, useMemo, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../api/authClient";
import type { AuthUser } from "../api/authClient";
import { emitLogout } from "../../../shared/lib/authEvents";

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
    const es = new EventSource(`${BACKEND_URL}/api/v1/news/stream?token=${sessionToken}`);

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

  useEffect(() => {
    // Sumber kebenaran tunggal untuk "tutup semua stream": begitu
    // sessionToken jadi null — apapun sebabnya (klik logout, sesi dicabut
    // paksa oleh admin lewat event 'logout' di atas, atau restoreSession
    // gagal saat mount) — broadcast ke semua consumer. emitLogout() aman
    // dipanggil berkali-kali (menutup EventSource yang sudah tertutup itu
    // no-op), jadi tidak masalah kalau ini beririsan dengan panggilan
    // eksplisit di logout() di bawah.
    if (!sessionToken) {
      emitLogout();
    }
  }, [sessionToken]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password); // throws AuthApiError on failure
    localStorage.setItem(STORAGE_KEY, result.sessionToken);
    setSessionToken(result.sessionToken);
    setUser(result.user);
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    // Persist the token only AFTER the backend verifies it — writing it
    // before fetchMe left a stale token in localStorage + state whenever
    // fetchMe threw (expired/invalid token).
    const { user: fetchedUser } = await authApi.fetchMe(token);
    localStorage.setItem(STORAGE_KEY, token);
    setSessionToken(token);
    setUser(fetchedUser);
  }, []);

  const logout = useCallback(async () => {
    // Tutup semua stream (me/stream, news/stream (for ticker, calendar, &c.), news/stream) SEKARANG JUGA — jangan nunggu network round-trip ke backend atau nunggu ProtectedRoute unmount komponen yang makai stream.
    emitLogout();
    
    if (sessionToken) {
      // Best-effort — even if this network call fails, forget the token
      // locally so the user isn't stuck "logged in" on this device.
      await authApi.logout(sessionToken).catch(() => {});
    }
    localStorage.removeItem(STORAGE_KEY);
    setSessionToken(null);
    setUser(null);
  }, [sessionToken]);

  // Memoized so consumers (e.g. AuthCallbackPage) get stable function
  // identities — an unstable `loginWithToken` made its effect re-fire on
  // every provider render (which loginWithToken itself triggers via
  // setSessionToken/setUser), re-processing the token on slow networks.
  const value = useMemo<AuthContextValue>(
    () => ({ user, setUser, isLoading, isConnected, login, loginWithToken, logout }),
    [user, setUser, isLoading, isConnected, login, loginWithToken, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() harus dipakai di dalam <AuthProvider>");
  return ctx;
}

