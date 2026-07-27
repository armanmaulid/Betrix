const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function fetchUserCredits(): Promise<number> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  if (!token) return 0;

  try {
    const res = await fetch(`${BACKEND_URL}/api/usage/current-month`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) return 0;
    
    const data = await res.json();
    return data.credits ?? data.totalTokens ?? 0;
  } catch (err) {
    console.error("Gagal mengambil data credits", err);
    return 0;
  }
}
