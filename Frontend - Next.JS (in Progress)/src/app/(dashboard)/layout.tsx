import { ProtectedRoute } from "../../features/auth/components/ProtectedRoute";
import { TerminalShellLayout } from "../../components/layout/TerminalShellLayout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <TerminalShellLayout>
        {children}
      </TerminalShellLayout>
    </ProtectedRoute>
  );
}
