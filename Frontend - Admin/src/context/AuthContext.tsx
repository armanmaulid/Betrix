import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, login as loginApi, logout as logoutApi } from "../api/auth";
import { registerUnauthorizedHandler } from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function clearSession() {
    localStorage.removeItem("sessionToken");
    setUser(null);
  }

  useEffect(() => {
    // Register handler supaya axios interceptor bisa auto-logout kalau
    // token expired/invalid (401) dari request mana pun.
    registerUnauthorizedHandler(clearSession);

    const token = localStorage.getItem("sessionToken");
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Validasi token yang tersisa di localStorage lewat GET /auth/me —
    // penting supaya refresh halaman nggak langsung nge-logout user.
    fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => clearSession())
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<User> {
    const { sessionToken, user } = await loginApi(email, password);
    localStorage.setItem("sessionToken", sessionToken);
    setUser(user);
    return user;
  }

  function logout() {
    const token = localStorage.getItem("sessionToken");
    if (token) {
      logoutApi(token).catch(() => {
        /* fire and forget — tetap clear session lokal walau request gagal */
      });
    }
    clearSession();
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return ctx;
}
