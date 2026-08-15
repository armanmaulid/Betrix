import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "../features/auth/context/AuthContext";
import { ProtectedRoute } from "../features/auth/components/ProtectedRoute";

import { LoginPage } from "../features/auth/pages/LoginPage";
const RegisterPage = lazy(() => import("../features/auth/pages/RegisterPage").then(m => ({ default: m.RegisterPage })));
const AuthCallbackPage = lazy(() => import("../features/auth/pages/AuthCallbackPage").then(m => ({ default: m.AuthCallbackPage })));

const DashboardPage = lazy(() => import("../features/analysis/pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const AnalyzePage = lazy(() => import("../features/analysis/pages/AnalyzePage").then(m => ({ default: m.AnalyzePage })));
const SettingsPage = lazy(() => import("../features/user/pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const NewsPage = lazy(() => import("../features/news/pages/NewsPage").then(m => ({ default: m.NewsPage })));
const EconomicCalendarPage = lazy(() => import("../features/market/pages/EconomicCalendarPage").then(m => ({ default: m.EconomicCalendarPage })));

import { TerminalShellLayout } from "./layout/TerminalShellLayout";

// Fallback minimalis senada tema terminal gelap — dipakai Suspense saat
// chunk route lain masih di-download.
function RouteFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--bg)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
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

  return (
    <AuthProvider>
      <TitleUpdater />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route element={<ProtectedRoute><TerminalShellLayout /></ProtectedRoute>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/analyze" element={<AnalyzePage />} />
              <Route path="/calendar" element={<EconomicCalendarPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/news" element={<NewsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
