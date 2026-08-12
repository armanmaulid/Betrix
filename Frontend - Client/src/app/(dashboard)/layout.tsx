import { TerminalShellLayout } from "../../components/layout/TerminalShellLayout";
import { ProtectedRoute } from "../../components/auth/ProtectedRoute";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <TerminalShellLayout>{children}</TerminalShellLayout>
    </ProtectedRoute>
  );
}


