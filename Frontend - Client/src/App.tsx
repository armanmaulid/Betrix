import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AnalyzePage } from "./pages/AnalyzePage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NewsPage } from "./pages/NewsPage";

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
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
