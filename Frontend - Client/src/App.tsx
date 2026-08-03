import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

// Setiap halaman di-lazy-load per route, bukan diimpor eager semua di
// bundle awal. LoginPage tetap eager karena itu yang paling sering jadi
// entry point pertama (belum login) — sisanya baru di-download begitu
// user benar-benar navigasi ke sana.
import { LoginPage } from "./pages/LoginPage";
const RegisterPage = lazy(() => import("./pages/RegisterPage").then(m => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const AnalyzePage = lazy(() => import("./pages/AnalyzePage").then(m => ({ default: m.AnalyzePage })));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage").then(m => ({ default: m.AuthCallbackPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const NewsPage = lazy(() => import("./pages/NewsPage").then(m => ({ default: m.NewsPage })));

// Fallback minimalis senada tema terminal gelap — dipakai Suspense saat
// chunk route lain masih di-download.
function RouteFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#050505] text-[10px] font-bold uppercase tracking-widest text-[#666]">
      Loading...
    </div>
  );
}

function TitleUpdater() {
  const { user } = useAuth();
  
  useEffect(() => {
    if (user?.email) {
      document.title = `Betrix - ${user.email}`;
    } else {
      document.title = "Betrix — Client";
    }
  }, [user]);

  return null;
}

export function App() {
  useEffect(() => {
    const disableEvent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", disableEvent);
    document.addEventListener("copy", disableEvent);
    document.addEventListener("paste", disableEvent);
    
    return () => {
      document.removeEventListener("contextmenu", disableEvent);
      document.removeEventListener("copy", disableEvent);
      document.removeEventListener("paste", disableEvent);
    };
  }, []);

  return (
    <AuthProvider>
      <TitleUpdater />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analyze"
              element={
                <ProtectedRoute>
                  <AnalyzePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/news"
              element={
                <ProtectedRoute>
                  <NewsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
