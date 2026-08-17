// Dipakai supaya AuthContext.logout() bisa langsung memberi sinyal ke semua
// konsumer SSE (termasuk yang state-nya di luar React, seperti global
// EventSource di useTickerPrices) untuk menutup koneksi mereka SAAT ITU JUGA
// — bukan menunggu efek samping unmount/redirect dari ProtectedRoute, yang
// timingnya tidak terjamin (mis. kalau nanti ada halaman yang render ticker
// tanpa dibungkus ProtectedRoute, atau di dalam modal yang tidak ikut
// unmount).
type Listener = () => void;

const listeners = new Set<Listener>();

export function onLogout(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLogout(): void {
  listeners.forEach((listener) => listener());
}

// Sinyal terpisah dari logout eksplisit: dipakai oleh API client (marketClient)
// saat menerima 401 di tengah request biasa. Berbeda dari emitLogout() yang hanya
// menutup stream — ini harus MENGURANGI state auth (sessionToken + user) supaya
// ProtectedRoute melakukan redirect SPA (soft) alih-alih full page reload.
const expiryListeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  expiryListeners.add(listener);
  return () => expiryListeners.delete(listener);
}

export function emitSessionExpired(): void {
  expiryListeners.forEach((listener) => listener());
}
