import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/auth/AuthLayout";

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token tidak ditemukan. Silakan coba login kembali.");
      return;
    }

    async function processToken() {
      try {
        await loginWithToken(token!);
        navigate("/", { replace: true });
      } catch (err: any) {
        setError(err.message || "Gagal memproses otentikasi. Silakan coba lagi.");
      }
    }

    processToken();
  }, [token, loginWithToken, navigate]);

  if (error) {
    return (
      <AuthLayout
        eyebrow="Error"
        title="Otentikasi Gagal"
        subtitle="Terjadi kesalahan saat memproses login Anda."
        footer={
          <>
            Kembali ke{" "}
            <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">
              Halaman Login
            </Link>
          </>
        }
      >
        <div className="flex items-start gap-2 border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[12px] text-[var(--danger)] animate-[shake_0.4s_ease-in-out]">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Memproses"
      title="Menyiapkan Sesi"
      subtitle="Mohon tunggu sebentar..."
      footer={<></>}
    >
      <div className="flex items-center justify-center p-8">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
      </div>
    </AuthLayout>
  );
}
